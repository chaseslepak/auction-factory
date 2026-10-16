import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Daily operations digest.
//
// Runs via Vercel cron at 7:00 UTC (3am ET). Aggregates the last 24h of:
//   - af_upload_attempts failures grouped by error_prefix
//   - Background jobs in status=failed (stock image / deep rescan)
//   - Pricing-feedback anomalies: brands that moved into "overpriced"
//     signal in the last window (median sold/listed < 0.4 with ≥3
//     samples)
//   - af_session validity (cookie fresh or stale)
//
// Emails Chase through Resend's HTTP API — no SDK dependency.
//
// Env required:
//   DIGEST_TO           Recipient email (default: chase.slepak@gmail.com)
//   RESEND_API_KEY      Resend bearer token
//   RESEND_FROM         Verified Resend sender (e.g. lotter@mail.auctionfactory.com)
//
// If RESEND_API_KEY is missing, returns the compiled HTML in the
// response instead of sending — handy for one-off manual previews.
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  const isCronOrServer = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  const isManualPreview = request.nextUrl.searchParams.get('preview') === '1';
  if (!isCronOrServer && !isManualPreview) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }
  const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // 1. Upload failure histogram
  const { data: failedAttempts } = await supabase
    .from('af_upload_attempts')
    .select('error_prefix, http_status, created_at')
    .eq('success', false)
    .gte('created_at', since24h)
    .limit(5000);
  const uploadBuckets: Record<string, number> = {};
  for (const a of failedAttempts || []) {
    const key = (a as any).error_prefix || `HTTP ${(a as any).http_status || '?'}`;
    uploadBuckets[key] = (uploadBuckets[key] || 0) + 1;
  }
  const uploadFailures = Object.entries(uploadBuckets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // 2. Background jobs failed
  const { data: failedJobs } = await supabase
    .from('jobs')
    .select('type, error, created_at')
    .eq('status', 'failed')
    .gte('created_at', since24h)
    .limit(500);
  const jobBuckets: Record<string, number> = {};
  for (const j of failedJobs || []) {
    const key = `${(j as any).type}: ${((j as any).error || '').substring(0, 60) || 'unknown'}`;
    jobBuckets[key] = (jobBuckets[key] || 0) + 1;
  }
  const jobFailures = Object.entries(jobBuckets)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  // 3. Pricing anomalies — brands that have swung into overpriced
  // signal recently (sold median < 40% of retail median across 3+
  // samples in last 30 days). Early warning that an upstream retail
  // source is drifting.
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: priceRows } = await supabase
    .from('af_archive_items')
    .select('brand, retail_new, sold_price')
    .not('retail_new', 'is', null)
    .not('sold_price', 'is', null)
    .gt('retail_new', 0)
    .gt('sold_price', 0)
    .gte('auction_closed_at', since30d)
    .limit(5000);
  const brandAgg: Record<string, number[]> = {};
  for (const r of priceRows || []) {
    const brand = ((r as any).brand || '').trim();
    if (!brand) continue;
    const ratio = Number((r as any).sold_price) / Number((r as any).retail_new);
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 10) continue;
    const key = brand.toLowerCase();
    if (!brandAgg[key]) brandAgg[key] = [];
    brandAgg[key].push(ratio);
  }
  const overpriced: Array<{ brand: string; samples: number; median: number }> = [];
  for (const [brand, ratios] of Object.entries(brandAgg)) {
    if (ratios.length < 3) continue;
    const sorted = [...ratios].sort((a, b) => a - b);
    const med = sorted[Math.floor(sorted.length / 2)];
    if (med < 0.4) {
      overpriced.push({ brand, samples: ratios.length, median: med });
    }
  }
  overpriced.sort((a, b) => a.median - b.median);

  // 4. AF session cookie age
  const { data: sess } = await supabase
    .from('af_session')
    .select('updated_at')
    .eq('id', 1)
    .single();
  const sessionAgeHours = sess?.updated_at
    ? Math.round((Date.now() - new Date(sess.updated_at).getTime()) / 36e5)
    : null;

  const html = renderDigest({
    uploadFailures,
    uploadFailuresTotal: (failedAttempts || []).length,
    jobFailures,
    jobFailuresTotal: (failedJobs || []).length,
    overpriced,
    sessionAgeHours,
  });

  const resendKey = process.env.RESEND_API_KEY;
  const to = process.env.DIGEST_TO || 'chase.slepak@gmail.com';
  const from = process.env.RESEND_FROM || 'lotter@mail.auctionfactory.com';

  if (!resendKey || isManualPreview) {
    return new NextResponse(html, {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  const subject = `Lotter daily digest — ${new Date().toISOString().slice(0, 10)}`;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json({ sent: false, status: res.status, body }, { status: 500 });
    }
    return NextResponse.json({ sent: true, id: body?.id || null });
  } catch (err: any) {
    return NextResponse.json({ sent: false, error: err?.message || 'Send failed' }, { status: 500 });
  }
}

function renderDigest(d: {
  uploadFailures: [string, number][];
  uploadFailuresTotal: number;
  jobFailures: [string, number][];
  jobFailuresTotal: number;
  overpriced: Array<{ brand: string; samples: number; median: number }>;
  sessionAgeHours: number | null;
}): string {
  const esc = (s: string) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
    );
  const row = (k: string, v: string | number) =>
    `<tr><td style="padding:4px 10px;border-bottom:1px solid #eee;">${esc(k)}</td><td style="padding:4px 10px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;"><b>${esc(String(v))}</b></td></tr>`;

  const uploadRows = d.uploadFailures.length === 0
    ? `<tr><td colspan="2" style="padding:8px 10px;color:#888;">No upload failures in last 24h.</td></tr>`
    : d.uploadFailures.map(([k, v]) => row(k, v)).join('');

  const jobRows = d.jobFailures.length === 0
    ? `<tr><td colspan="2" style="padding:8px 10px;color:#888;">No background job failures in last 24h.</td></tr>`
    : d.jobFailures.map(([k, v]) => row(k, v)).join('');

  const priceRows = d.overpriced.length === 0
    ? `<tr><td colspan="3" style="padding:8px 10px;color:#888;">No chronic overpricing flagged.</td></tr>`
    : d.overpriced.map((p) =>
        `<tr><td style="padding:4px 10px;border-bottom:1px solid #eee;">${esc(p.brand)}</td><td style="padding:4px 10px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;">${p.samples}</td><td style="padding:4px 10px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;color:#c00;"><b>${Math.round(p.median * 100)}%</b></td></tr>`,
      ).join('');

  const sessionBanner = d.sessionAgeHours == null
    ? `<div style="padding:10px 14px;background:#fef2f2;border-left:4px solid #c00;color:#c00;"><b>No AF session cookie stored.</b> Set one at /settings.</div>`
    : d.sessionAgeHours > 48
    ? `<div style="padding:10px 14px;background:#fef3c7;border-left:4px solid #d97706;color:#92400e;"><b>AF session cookie is ${d.sessionAgeHours}h old.</b> Likely stale — refresh at /settings or let auto-renewal run.</div>`
    : `<div style="padding:10px 14px;background:#ecfdf5;border-left:4px solid #059669;color:#065f46;">AF session cookie fresh (${d.sessionAgeHours}h old).</div>`;

  return `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:16px;background:#fafafa;color:#111;">
<h1 style="font-size:22px;margin:0 0 4px 0;">Lotter daily digest</h1>
<p style="margin:0 0 16px 0;color:#666;font-size:13px;">${new Date().toISOString()}</p>
${sessionBanner}

<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.5px;margin:20px 0 6px 0;color:#111;">Upload failures last 24h · <span style="color:#c00;">${d.uploadFailuresTotal} total</span></h2>
<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eee;border-radius:6px;overflow:hidden;font-size:13px;">
<thead><tr style="background:#f5f5f5;"><th style="padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#666;">Error prefix</th><th style="padding:6px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#666;">Count</th></tr></thead>
<tbody>${uploadRows}</tbody>
</table>

<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.5px;margin:20px 0 6px 0;color:#111;">Background jobs failed · <span style="color:#c00;">${d.jobFailuresTotal} total</span></h2>
<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eee;border-radius:6px;overflow:hidden;font-size:13px;">
<thead><tr style="background:#f5f5f5;"><th style="padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#666;">Job type / error</th><th style="padding:6px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#666;">Count</th></tr></thead>
<tbody>${jobRows}</tbody>
</table>

<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.5px;margin:20px 0 6px 0;color:#111;">Chronic overpricing (30d, ≥3 samples)</h2>
<table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #eee;border-radius:6px;overflow:hidden;font-size:13px;">
<thead><tr style="background:#f5f5f5;"><th style="padding:6px 10px;text-align:left;font-size:11px;text-transform:uppercase;color:#666;">Brand</th><th style="padding:6px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#666;">Samples</th><th style="padding:6px 10px;text-align:right;font-size:11px;text-transform:uppercase;color:#666;">Sold/listed</th></tr></thead>
<tbody>${priceRows}</tbody>
</table>

<p style="margin:24px 0 0 0;font-size:11px;color:#888;">Lotter · auction-factory</p>
</body></html>`;
}
