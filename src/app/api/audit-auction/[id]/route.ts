import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { scrapeAuction, ScrapedAFAuction, ScrapedAFItem } from '@/lib/af-scraper';
import { fetchAdminItemList } from '@/lib/af-admin-scraper';

// Try the admin-flow item list first (authenticated, more stable markup),
// fall back to the public buyer-facing scrape if no cookie or if admin
// errors. Returns the same shape as scrapeAuction so the diff logic
// doesn't need to care which source produced the items. The `source`
// field lets the UI show "scraped from admin" vs "scraped from public."
async function scrapeAuctionPreferAdmin(
  afAuctionId: string,
  cookie: string | null
): Promise<ScrapedAFAuction & { source: 'admin' | 'public' }> {
  if (cookie) {
    try {
      const adminItems = await fetchAdminItemList(afAuctionId, cookie);
      // Shape adapter: AdminItem → ScrapedAFItem. The admin list only
      // has (af_item_id, title, lot_number); the richer public fields
      // (photos, description, condition, current_bid, brand, model,
      // dimensions) are unavailable — audit doesn't need them.
      const items: ScrapedAFItem[] = adminItems.map((a) => ({
        lot_number: a.lot_number,
        title: a.title,
        af_item_id: String(a.af_item_id),
        af_item_url: `https://auctionfactory.com/item_detail.php?item=${a.af_item_id}`,
        description: '',
        photos: [],
        condition: '',
        current_bid: '',
        brand: '',
        model: '',
        dimensions: '',
      }));
      return {
        af_url: `https://auctionfactory.com/admin/relot_auction.php?auction=${afAuctionId}`,
        af_name: '', // admin flow doesn't surface auction name
        items,
        parse_source: 'primary',
        parse_errors: 0,
        source: 'admin',
      };
    } catch (err) {
      // Admin flow failed (likely cookie expired or admin page redesign);
      // fall through to the public scrape so audit still runs.
      console.warn('Admin item list fetch failed, falling back to public scrape:', err);
    }
  }
  const publicScrape = await scrapeAuction(
    `https://auctionfactory.com/auction_details.php?auction=${afAuctionId}`,
    false
  );
  return { ...publicScrape, source: 'public' };
}

async function readAFCookie(supabase: any): Promise<string | null> {
  try {
    const { data } = await supabase
      .from('af_session')
      .select('session_cookie')
      .eq('id', 1)
      .single();
    if (!data?.session_cookie) return null;
    let cookie = data.session_cookie;
    try {
      const { decrypt } = await import('@/lib/crypto');
      cookie = decrypt(cookie);
    } catch {}
    return cookie;
  } catch {
    return null;
  }
}

export const maxDuration = 60;

// GET /api/audit-auction/[id]
// Fetches the mapped AF auction via public scraper + all lots from the
// lotter, and returns a diff of what's present on each side.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'Service role key not configured' },
      { status: 500 }
    );
  }
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  );

  const auctionId = params.id;

  const [auctionRes, mapRes, lotsRes] = await Promise.all([
    supabase.from('auctions').select('id, name').eq('id', auctionId).single(),
    supabase
      .from('af_auction_map')
      .select('af_auction_id')
      .eq('auction_id', auctionId)
      .single(),
    supabase
      .from('lots')
      .select('id, lot_number, item_name, brand, model, af_upload_status, af_item_id')
      .eq('auction_id', auctionId)
      .is('deleted_at', null)
      .order('lot_number', { ascending: true, nullsFirst: false })
      .limit(10000),
  ]);
  const { data: auction } = auctionRes;
  const { data: mapRow } = mapRes;
  const { data: lots, error: lotsErr } = lotsRes;

  // Surface silent query errors — a schema mismatch (e.g. an older
  // migration missing a column) returns data=null without throwing,
  // which previously made the UI show "LOTTER: 0" even when the DB had
  // hundreds of rows.
  if (lotsErr) {
    return NextResponse.json(
      {
        error: `Lots query failed: ${lotsErr.message}. The audit cannot run until this is resolved — likely a missing migration (phase15 af_item_id?).`,
      },
      { status: 500 },
    );
  }

  if (!auction) {
    return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
  }
  if (!mapRow) {
    return NextResponse.json(
      {
        error:
          'This auction is not linked to an AF auction. Link it first via "Link AF Auction for Upload".',
      },
      { status: 400 }
    );
  }

  const afUrl = `https://auctionfactory.com/auction_details.php?auction=${mapRow.af_auction_id}`;
  const cookie = await readAFCookie(supabase);

  let scraped;
  try {
    scraped = await scrapeAuctionPreferAdmin(String(mapRow.af_auction_id), cookie);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to scrape AF: ${err?.message || String(err)}` },
      { status: 502 }
    );
  }

  type LotterRow = NonNullable<typeof lots>[number];
  // Normalize titles for lotter↔AF comparison. Handles:
  //  - case + whitespace
  //  - HTML entities AF often emits in rendered titles (&amp; &quot; &#039;)
  //  - smart quotes vs straight quotes
  //  - em-dash / en-dash vs regular hyphen
  // Prevents false mismatches where titles are visually identical but
  // encoded differently on each side.
  const normTitle = (s: string | null | undefined) => {
    if (!s) return '';
    return s
      .toLowerCase()
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const lotterByNumber = new Map<number, LotterRow>();
  // af_item_id is the durable key: when the lotter captured one on a
  // successful upload, we trust it over lot_number. Audit uses this to
  // avoid flagging a lot as "only in lotter" just because AF reshuffled
  // its lot_numbers (e.g. a human relotted on AF without going through
  // our relot-sync).
  const lotterByAfItemId = new Map<number, LotterRow>();
  // Fallback title index: when neither af_item_id nor lot_number
  // matches (e.g. Chase re-numbered a lot in the lotter after push, and
  // af_item_id was never captured), a unique title match should still
  // link the two sides so audit doesn't false-positive flag items as
  // orphaned on both sides.
  const lotterByTitle = new Map<string, LotterRow[]>();
  (lots || []).forEach((l) => {
    lotterByNumber.set(l.lot_number, l);
    if ((l as any).af_item_id != null) {
      lotterByAfItemId.set(Number((l as any).af_item_id), l);
    }
    const key = normTitle(l.item_name);
    if (key) {
      const bucket = lotterByTitle.get(key) || [];
      bucket.push(l);
      lotterByTitle.set(key, bucket);
    }
  });

  // Group AF items by lot number to detect duplicates within AF itself
  const afByNumber = new Map<number, typeof scraped.items>();
  const afByItemId = new Map<number, (typeof scraped.items)[number]>();
  const afByTitle = new Map<string, typeof scraped.items>();
  scraped.items.forEach((item) => {
    if (item.lot_number == null) return;
    const bucket = afByNumber.get(item.lot_number) || [];
    bucket.push(item);
    afByNumber.set(item.lot_number, bucket);
    const idNum = Number(item.af_item_id);
    if (Number.isFinite(idNum) && idNum > 0) {
      afByItemId.set(idNum, item);
    }
    const key = normTitle(item.title);
    if (key) {
      const titleBucket = afByTitle.get(key) || [];
      titleBucket.push(item);
      afByTitle.set(key, titleBucket);
    }
  });

  // Compute diffs. "Linked" = this lotter lot has an af_item_id that
  // AF confirms exists. Linked lots are NEVER flagged as only_in_lotter,
  // regardless of lot_number drift. Secondary link: unique title match
  // on both sides, regardless of lot_number position.
  //
  // Earlier version required same lot_number (H5 overnight fix). That
  // blocked Chase's actual use case: AF renumbers items after deletions,
  // so lotter lot_number=1 and AF lot_number=32 for the same product
  // are the SAME item. End-of-push relot will realign AF's lot_numbers
  // to match lotter's intentions, so linking by title alone is safe.
  //
  // The uniqueness constraint (both buckets size 1) still prevents
  // false links on common titles ("Vintage Chair" appearing on multiple
  // lots in either side will NOT auto-link; user resolves manually via
  // audit page's per-row buttons).
  const lotIsLinked = (l: LotterRow): boolean => {
    if ((l as any).af_item_id != null && afByItemId.has(Number((l as any).af_item_id))) return true;
    if ((l as any).af_item_id != null) return false;
    const key = normTitle(l.item_name);
    if (!key) return false;
    const afBucket = afByTitle.get(key) || [];
    const lotterBucket = lotterByTitle.get(key) || [];
    return afBucket.length === 1 && lotterBucket.length === 1;
  };
  const afItemIsLinked = (item: (typeof scraped.items)[number]): boolean => {
    if (lotterByAfItemId.has(Number(item.af_item_id))) return true;
    const key = normTitle(item.title);
    if (!key) return false;
    const lotterBucket = lotterByTitle.get(key) || [];
    const afBucket = afByTitle.get(key) || [];
    return lotterBucket.length === 1 && afBucket.length === 1;
  };

  const onlyInLotter: Array<{
    lot_id: string;
    lot_number: number;
    item_name: string;
    af_upload_status: string | null;
  }> = [];
  const onlyInAf: Array<{ lot_number: number; title: string; af_item_url: string }> =
    [];
  const duplicatesInAf: Array<{
    lot_number: number;
    count: number;
    copies: Array<{ af_item_id: string; title: string; af_item_url: string }>;
  }> = [];
  const numberCollisions: Array<{
    lot_id: string;
    lot_number: number;
    lotter_item: string;
    af_titles: string[];
  }> = [];

  // Only-in-lotter
  lotterByNumber.forEach((lot, num) => {
    if (lotIsLinked(lot)) return;
    if (!afByNumber.has(num)) {
      onlyInLotter.push({
        lot_id: (lot as any).id,
        lot_number: num,
        item_name: lot.item_name || '(no name)',
        af_upload_status: lot.af_upload_status,
      });
    }
  });

  // Only-in-AF and duplicates
  afByNumber.forEach((items, num) => {
    if (items.length > 1) {
      duplicatesInAf.push({
        lot_number: num,
        count: items.length,
        copies: items.map((i) => ({
          af_item_id: i.af_item_id,
          title: i.title,
          af_item_url: i.af_item_url,
        })),
      });
    }
    // Skip AF items that af_item_id-link to a lotter lot — the pair
    // is correctly matched regardless of lot_number drift.
    const anyLinked = items.some(afItemIsLinked);
    if (anyLinked) return;
    if (!lotterByNumber.has(num)) {
      onlyInAf.push({
        lot_number: num,
        title: items[0].title,
        af_item_url: items[0].af_item_url,
      });
    } else {
      // Both sides have the lot number — flag possible name mismatch
      const lotterItem = (lotterByNumber.get(num)!.item_name || '').toLowerCase();
      const afTitle = (items[0].title || '').toLowerCase();
      // Rough mismatch heuristic: neither side is empty AND no significant
      // overlap in words
      if (lotterItem && afTitle) {
        const lotterWords = new Set<string>(
          lotterItem.split(/\s+/).filter((w: string) => w.length > 3)
        );
        const afWords = new Set<string>(
          afTitle.split(/\s+/).filter((w: string) => w.length > 3)
        );
        let overlap = 0;
        lotterWords.forEach((w: string) => {
          if (afWords.has(w)) overlap++;
        });
        if (overlap === 0 && lotterWords.size > 0 && afWords.size > 0) {
          numberCollisions.push({
            lot_id: (lotterByNumber.get(num) as any).id,
            lot_number: num,
            lotter_item: lotterByNumber.get(num)!.item_name || '(no name)',
            af_titles: items.map((i) => i.title).slice(0, 3),
          });
        }
      }
    }
  });

  onlyInLotter.sort((a, b) => a.lot_number - b.lot_number);
  onlyInAf.sort((a, b) => a.lot_number - b.lot_number);
  duplicatesInAf.sort((a, b) => a.lot_number - b.lot_number);
  numberCollisions.sort((a, b) => a.lot_number - b.lot_number);

  // Count af_item_id-matched pairs separately so the UI can show
  // "N of M lotter lots have a durable AF link" as a trust indicator.
  const afIdMatched = (lots || []).reduce((acc: number, l: any) =>
    acc + (l.af_item_id != null && afByItemId.has(Number(l.af_item_id)) ? 1 : 0), 0);

  // Surface scraper diagnostics so the audit UI can show a warning
  // when the parser is in degraded mode (fallback splitter used, or
  // high parse-error rate on primary). The UI should refuse to let
  // the user Sync in this state until the primary parser works again.
  const scraperWarning: string | null = (() => {
    if (scraped.parse_source === 'fallback') {
      return 'Primary scraper parser is broken — audit is running on a fallback that may miss lot numbers. Report this; do NOT sync until fixed.';
    }
    const errRatePct = scraped.items.length > 0
      ? Math.round(((scraped.parse_errors || 0) / (scraped.items.length + (scraped.parse_errors || 0))) * 100)
      : 0;
    if (errRatePct > 10) {
      return `Scraper hit ${scraped.parse_errors} parse errors (${errRatePct}% of blocks). Results may be partial — review Only-in-AF and Possible-mismatches carefully before syncing.`;
    }
    return null;
  })();

  return NextResponse.json({
    auction_name: auction.name,
    af_auction_id: mapRow.af_auction_id,
    af_url: afUrl,
    counts: {
      lotter_lots: lots?.length || 0,
      af_lots: scraped.items.length,
      af_id_matched: afIdMatched,
    },
    scraper_warning: scraperWarning,
    scraper_diag: {
      parse_source: scraped.parse_source,
      parse_errors: scraped.parse_errors,
    },
    only_in_lotter: onlyInLotter,
    only_in_af: onlyInAf,
    duplicates_in_af: duplicatesInAf,
    possible_name_mismatches: numberCollisions,
  });
}

// POST /api/audit-auction/[id]
// Re-scrapes AF and syncs the lotter's af_upload_status.
//
// Match logic:
//   * A lotter lot is "on AF" if its af_item_id matches an AF item
//     (strongest; durable key captured on upload) OR its lot_number
//     matches an AF item's lot_number.
//   * Lots on AF whose af_upload_status is not 'uploaded' get marked.
//   * Lots NOT on AF are candidates for clearing — but the default
//     clear_mode is 'none' (never clear) because scraper regressions
//     + stale status reads are what caused the Oct 15 duplicate-upload
//     disaster. Opt-in via clear_mode:
//       - 'none' (DEFAULT): mark only, never clear.
//       - 'exact_matches_only': clear status for lots that have NEVER
//         been successfully uploaded (status in null/queued/failed).
//         Safe — doesn't touch 'uploaded' rows.
//       - 'legacy': the pre-fbfb438 behavior that cleared any row the
//         scraper didn't find. Requires force:true. Behind the 90%
//         coverage gate.
//
// Body: { confirm: true, clear_mode?: 'none'|'exact_matches_only'|'legacy', force?: boolean }
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (body?.confirm !== true) {
    return NextResponse.json(
      { error: 'Missing confirm: true in body' },
      { status: 400 }
    );
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'Service role key not configured' },
      { status: 500 }
    );
  }
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  );

  const auctionId = params.id;

  const [{ data: mapRow }, { data: lots }] = await Promise.all([
    supabase
      .from('af_auction_map')
      .select('af_auction_id')
      .eq('auction_id', auctionId)
      .single(),
    supabase
      .from('lots')
      .select('id, lot_number, af_upload_status, af_item_id')
      .eq('auction_id', auctionId)
      .is('deleted_at', null),
  ]);

  if (!mapRow) {
    return NextResponse.json(
      { error: 'This auction is not linked to an AF auction.' },
      { status: 400 }
    );
  }

  const cookie = await readAFCookie(supabase);
  let scraped;
  try {
    scraped = await scrapeAuctionPreferAdmin(String(mapRow.af_auction_id), cookie);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to scrape AF: ${err?.message || String(err)}` },
      { status: 502 }
    );
  }

  // Refuse any sync when the AF scrape fell back to the public
  // fragile parser (no lot_numbers, no reliable duplicate detection).
  // Operating on fallback data has nuked valid 'uploaded' statuses
  // before and caused duplicate uploads on the next push. The admin
  // flow needs a healthy AF cookie — if that's not available, Chase
  // reconnects AF in Settings first.
  if ((scraped as any).parse_source === 'fallback') {
    return NextResponse.json(
      {
        error:
          'AF scrape fell back to the fragile public parser — refusing to run a sync. ' +
          'Reconnect your AF admin session in Settings so the admin-list scrape succeeds, then re-run audit.',
        scraper_warning: 'parse_source=fallback — sync disabled',
      },
      { status: 409 },
    );
  }

  const clearMode: 'none' | 'exact_matches_only' | 'legacy' =
    body?.clear_mode === 'exact_matches_only' ? 'exact_matches_only'
    : body?.clear_mode === 'legacy' ? 'legacy'
    : 'none';

  const afNumbers = new Set<number>();
  const afItemIds = new Set<number>();
  scraped.items.forEach((it) => {
    if (it.lot_number != null) afNumbers.add(it.lot_number);
    const idNum = Number(it.af_item_id);
    if (Number.isFinite(idNum) && idNum > 0) afItemIds.add(idNum);
  });

  // Match lotter → AF via (a) af_item_id (durable) or (b) lot_number
  // WITH a title-sanity check. Prior behavior was union-only on
  // lot_number which caused silent wrong-link corruption: a lotter lot
  // at lot_number N would be marked 'uploaded' even if the AF item at
  // position N was an unrelated manual add or a prior re-lot shuffle.
  // Downstream, the real lot was then excluded from HQ Push forever.
  //
  // Now: lot_number-only matches require the AF item at that position
  // to share a normalized title with the lotter lot. af_item_id matches
  // skip the title check (durable key is strong enough on its own).
  // Keep normalizer consistent with the GET handler (HTML entity +
  // smart quote decoding). Local copy — small enough to not need
  // module-scope hoisting right now.
  const normTitle = (s: string | null | undefined) => {
    if (!s) return '';
    return s
      .toLowerCase()
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#0?39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[–—]/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  };
  const afByLotNumber = new Map<number, (typeof scraped.items)[number]>();
  // Title → AF items with that title (array because titles can repeat).
  const afByTitleSync = new Map<string, (typeof scraped.items)[number][]>();
  for (const it of scraped.items) {
    if (it.lot_number != null) afByLotNumber.set(it.lot_number, it);
    const k = normTitle(it.title);
    if (k) {
      const arr = afByTitleSync.get(k) || [];
      arr.push(it);
      afByTitleSync.set(k, arr);
    }
  }
  // Lotter title bucket for uniqueness check (prevents false-link when
  // two lotter rows share a title).
  const lotterByTitleSync = new Map<string, any[]>();
  (lots || []).forEach((l: any) => {
    const k = normTitle(l.item_name);
    if (!k) return;
    const arr = lotterByTitleSync.get(k) || [];
    arr.push(l);
    lotterByTitleSync.set(k, arr);
  });
  const toMarkUploaded: string[] = []; // lot IDs now, not lot_numbers
  const toClearIds: string[] = [];
  const lotsClearedWithStatusUploaded: number[] = [];
  (lots || []).forEach((l: any) => {
    const afIdMatch =
      l.af_item_id != null && afItemIds.has(Number(l.af_item_id));
    const afAtNumber = afByLotNumber.get(l.lot_number);
    // (a) Same lot_number AND title agrees → strong match.
    const lotNumMatch =
      afAtNumber != null &&
      normTitle(afAtNumber.title) === normTitle(l.item_name);
    // (b) Title is unique on both sides, regardless of lot_number →
    // safe match because end-of-push relot will renumber AF to the
    // lotter's intended lot_numbers. Uniqueness constraint stops
    // false-links on common titles.
    const titleKey = normTitle(l.item_name);
    const uniqueTitleMatch =
      !!titleKey &&
      (afByTitleSync.get(titleKey)?.length === 1) &&
      (lotterByTitleSync.get(titleKey)?.length === 1);
    const isOnAf = afIdMatch || lotNumMatch || uniqueTitleMatch;
    const currentlyUploaded = l.af_upload_status === 'uploaded';
    if (isOnAf && !currentlyUploaded) {
      toMarkUploaded.push(l.id);
    } else if (!isOnAf && l.af_upload_status !== null) {
      // Candidate for clear — but gated by clear_mode below.
      if (clearMode === 'none') return;
      if (clearMode === 'exact_matches_only' && currentlyUploaded) return;
      if (clearMode === 'legacy' && currentlyUploaded) {
        lotsClearedWithStatusUploaded.push(l.lot_number);
      }
      toClearIds.push(l.id);
    }
  });

  const lotterCount = (lots || []).length;
  const scrapedCount = scraped.items.length;

  // SAFETY GATE for legacy mode — never clear 'uploaded' statuses
  // when scraper coverage is thin. Legacy mode is the mode that caused
  // the Oct 15 duplicate-upload disaster; its only legitimate use is
  // Chase manually recovering a corrupted status column.
  if (clearMode === 'legacy' && toClearIds.length > 0 && scrapedCount < lotterCount * 0.9 && !body?.force) {
    return NextResponse.json(
      {
        error:
          `Refusing to clear ${toClearIds.length} statuses in LEGACY mode. Scraper found ${scrapedCount} items on AF but lotter has ${lotterCount} lots — the gap is too wide to trust the "only in lotter" bucket. ` +
          `Legacy mode cleared statuses on this scale is what caused the Oct 15 disaster. If AF genuinely has that many fewer items, re-run with { "confirm": true, "clear_mode": "legacy", "force": true }. ` +
          `Safer alternative: use clear_mode: "exact_matches_only" to clear only lots that have never been successfully uploaded.`,
        scraped_af_count: scrapedCount,
        lotter_count: lotterCount,
        would_mark_uploaded: toMarkUploaded.length,
        would_clear: toClearIds.length,
      },
      { status: 400 }
    );
  }

  const errors: string[] = [];

  if (toMarkUploaded.length > 0) {
    const { error } = await supabase
      .from('lots')
      .update({ af_upload_status: 'uploaded', af_upload_error: null })
      .in('id', toMarkUploaded)
      .is('deleted_at', null);
    if (error) errors.push(`mark-uploaded failed: ${error.message}`);
  }

  if (toClearIds.length > 0) {
    const { error } = await supabase
      .from('lots')
      .update({ af_upload_status: null, af_upload_error: null })
      .in('id', toClearIds)
      .is('deleted_at', null);
    if (error) errors.push(`clear failed: ${error.message}`);
  }

  if (errors.length > 0) {
    return NextResponse.json(
      {
        error: errors.join('; '),
        marked_uploaded: toMarkUploaded.length - (errors.some((e) => e.startsWith('mark')) ? toMarkUploaded.length : 0),
        cleared: toClearIds.length - (errors.some((e) => e.startsWith('clear')) ? toClearIds.length : 0),
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    reset_count: toMarkUploaded.length + toClearIds.length,
    marked_uploaded: toMarkUploaded.length,
    cleared: toClearIds.length,
    clear_mode: clearMode,
    scraped_af_count: scrapedCount,
    lotter_count: lotterCount,
  });
}
