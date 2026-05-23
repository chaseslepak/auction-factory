import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;

// Trigger the processor to start using waitUntil for reliability.
// Sends the CRON_SECRET in Authorization so /api/jobs/process accepts this
// server-to-server call (no user cookies are forwarded by server fetch).
async function triggerProcessor(request: NextRequest) {
  try {
    const origin = request.nextUrl.origin;
    const url = `${origin}/api/jobs/process`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.CRON_SECRET) {
      headers.Authorization = `Bearer ${process.env.CRON_SECRET}`;
    }

    try {
      const { waitUntil } = await import('@vercel/functions');
      waitUntil(fetch(url, { method: 'POST', headers }).catch(() => {}));
    } catch {
      // Fallback: fire-and-forget
      fetch(url, { method: 'POST', headers }).catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch {}
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    auction_id,
    job_type = 'refresh_stock_images',
    lot_ids,
  } = await request.json();

  if (!auction_id) {
    return NextResponse.json({ error: 'auction_id required' }, { status: 400 });
  }

  // When explicit lot_ids are provided (per-lot manual trigger) we skip the
  // condition gate — users can force a search on any lot regardless of condition.
  const explicitLots = Array.isArray(lot_ids) && lot_ids.length > 0;

  let lotsQuery = supabase
    .from('lots')
    .select('id, brand, model, condition_rating')
    .eq('auction_id', auction_id)
    .limit(1000);

  if (explicitLots) {
    lotsQuery = lotsQuery.in('id', lot_ids);
  }

  const { data: lots, error } = await lotsQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Bulk: require brand/model + condition 10 "New in box".
  // Per-lot: just require brand/model.
  const candidates = (lots || []).filter((lot: any) => {
    const hasBrand = lot.brand && lot.brand !== 'Unknown' && lot.brand.trim() !== '';
    const hasModel = lot.model && lot.model !== 'Unknown' && lot.model.trim() !== '';
    if (!(hasBrand || hasModel)) return false;
    if (!explicitLots && Number(lot.condition_rating) !== 10) return false;
    return true;
  });

  if (candidates.length === 0) {
    return NextResponse.json({
      enqueued: 0,
      message: explicitLots
        ? `Selected lot has no brand or model — can't search for a stock image.`
        : `0 of ${lots?.length || 0} lots are eligible (need brand/model + condition 10 "New in box").`,
    });
  }

  // For bulk refreshes, clear old jobs so the progress count starts fresh.
  // For per-lot triggers, just delete this lot's prior job(s) so it can be re-run.
  if (explicitLots) {
    await supabase
      .from('jobs')
      .delete()
      .eq('type', job_type)
      .eq('auction_id', auction_id)
      .in('lot_id', candidates.map((c: any) => c.id));
  } else {
    await supabase
      .from('jobs')
      .delete()
      .eq('type', job_type)
      .eq('auction_id', auction_id);
  }

  // Insert new jobs
  const jobsToInsert = candidates.map((lot: any) => ({
    type: job_type,
    status: 'pending',
    auction_id,
    lot_id: lot.id,
  }));

  const { error: insertError } = await supabase.from('jobs').insert(jobsToInsert);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Trigger the processor to start
  await triggerProcessor(request);

  return NextResponse.json({
    enqueued: candidates.length,
    totalLots: lots?.length || 0,
    message: `Queued ${candidates.length} lots for processing in the background`,
  });
}
