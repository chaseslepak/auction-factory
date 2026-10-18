import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { fetchAdminItemList } from '@/lib/af-admin-scraper';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// C5 pagination probe. Fetches AF's relot_auction.php for the given
// lotter auction's linked AF auction, counts the rows our parser sees,
// and surfaces signals that would indicate AF is paginating the form:
//   - pagination link markers in the raw HTML (page=/offset=/limit=)
//   - "Next" / "Previous" / "Page N of M" text
//   - raw HTML byte length (very small for a large auction = truncation)
//   - the lotter's own uploaded count for comparison
//
// The idempotency guard that keeps duplicates off AF assumes
// relot_auction.php emits ALL rows on one page. If AF paginates, that
// guard false-negatives on page-2 items → duplicates on the next push.
// This endpoint answers the question without having to push anything.
//
// Usage: open /api/admin/check-af-pagination/<lotter-auction-uuid> in a
// logged-in admin browser tab. Returns JSON for inspection.

const AF_BASE = 'https://auctionfactory.com/admin';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } },
) {
  const userClient = createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'Service role key not configured' },
      { status: 500 },
    );
  }
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );

  // Resolve lotter → AF auction + fetch session cookie + count uploaded
  // lots, all in parallel.
  const [{ data: mapping }, { data: session }, { count: uploadedCount }] =
    await Promise.all([
      supabase
        .from('af_auction_map')
        .select('af_auction_id')
        .eq('auction_id', params.id)
        .maybeSingle(),
      supabase.from('af_session').select('session_cookie').eq('id', 1).maybeSingle(),
      supabase
        .from('lots')
        .select('id', { count: 'exact', head: true })
        .eq('auction_id', params.id)
        .eq('af_upload_status', 'uploaded')
        .is('deleted_at', null),
    ]);

  if (!mapping?.af_auction_id) {
    return NextResponse.json(
      { error: `No AF auction linked for lotter auction ${params.id}` },
      { status: 400 },
    );
  }
  if (!session?.session_cookie) {
    return NextResponse.json(
      { error: 'No AF session cookie — reconnect AF in Settings first' },
      { status: 400 },
    );
  }

  let cookie = session.session_cookie;
  try {
    const { decrypt } = await import('@/lib/crypto');
    cookie = decrypt(cookie);
  } catch {}

  const relotUrl = `${AF_BASE}/relot_auction.php?auction=${mapping.af_auction_id}&relot=Re-Lot`;

  // Fetch the raw HTML so we can inspect for pagination markers.
  let rawRes;
  try {
    rawRes = await fetch(relotUrl, {
      headers: { Cookie: cookie, 'User-Agent': BROWSER_UA, Accept: 'text/html' },
      redirect: 'manual',
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: `Fetch failed: ${err?.message || String(err)}` },
      { status: 502 },
    );
  }

  const rawHtml = await rawRes.text();
  const sessionExpired = /name=["']psEmail["']|name=["']psPassword["']/i.test(
    rawHtml.substring(0, 5000),
  );

  // Independent parse via the real scraper — this is what the push
  // pipeline sees, so its count is the authoritative "idempotency
  // guard would see N items".
  let scraperCount: number | null = null;
  let scraperError: string | null = null;
  try {
    const items = await fetchAdminItemList(String(mapping.af_auction_id), cookie);
    scraperCount = items.length;
  } catch (err: any) {
    scraperError = err?.message || String(err);
  }

  // Pagination signal scan. STRONG signals are near-certain evidence
  // of pagination; WEAK signals can false-fire on unrelated markup
  // (e.g. "Previous Lot Number" column header matching /prev/).
  // Verdict is PAGINATES only if ANY strong signal fires, OR at least
  // TWO weak signals fire together.
  const paginationSignals = {
    // Strong: unambiguous pagination markup.
    page_query_param: /\bpage=\d+/.test(rawHtml),
    offset_query_param: /\boffset=\d+/.test(rawHtml),
    limit_query_param: /\blimit=\d+/.test(rawHtml),
    next_link: /\b(Next\s+Page|&gt;&gt;\s*Next|&raquo;\s*Next)/i.test(rawHtml),
    page_n_of_m: /\bPage\s+\d+\s+of\s+\d+\b/i.test(rawHtml),
    pagination_class: /class=["'][^"']*pag(ination|er|elinks)[^"']*["']/i.test(rawHtml),
    // Weak: common false-positive sources; need ≥1 strong or ≥2 weak.
    prev_link_weak: /\b(Prev|Previous|&lt;&lt;|&laquo;)\s*(Page)?/i.test(rawHtml),
    results_per_page_weak: /results?[\s_-]*per[\s_-]*page/i.test(rawHtml),
  };
  const strongHit = ['page_query_param', 'offset_query_param', 'limit_query_param', 'next_link', 'page_n_of_m', 'pagination_class']
    .some((k) => (paginationSignals as any)[k]);
  const weakHits = ['prev_link_weak', 'results_per_page_weak']
    .filter((k) => (paginationSignals as any)[k]).length;
  const anyPaginationSignal = strongHit || weakHits >= 2;

  const verdict = (() => {
    if (sessionExpired) return 'session_expired — reconnect AF in Settings';
    if (scraperError) return `scraper_error — ${scraperError}`;
    if (anyPaginationSignal) {
      return `PAGINATES — AF appears to be paginating relot_auction.php. The idempotency guard CAN false-negative on items past page 1. See pagination_signals below.`;
    }
    if (uploadedCount != null && scraperCount != null && uploadedCount >= 10) {
      if (scraperCount < uploadedCount * 0.9) {
        return `UNDERCOUNT — scrape returned ${scraperCount} but lotter has ${uploadedCount} uploaded. No pagination signals found, but the gap suggests truncation. Needs investigation.`;
      }
    }
    return `OK — scrape returned ${scraperCount} items, no pagination markers detected. Idempotency guard assumption looks safe.`;
  })();

  return NextResponse.json({
    verdict,
    lotter_auction_id: params.id,
    af_auction_id: mapping.af_auction_id,
    af_relot_url: relotUrl,
    http_status: rawRes.status,
    raw_html_bytes: rawHtml.length,
    scraper_count: scraperCount,
    scraper_error: scraperError,
    lotter_uploaded_count: uploadedCount ?? null,
    session_expired: sessionExpired,
    pagination_signals: paginationSignals,
    any_pagination_signal: anyPaginationSignal,
  });
}
