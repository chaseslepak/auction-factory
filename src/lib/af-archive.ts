import { SupabaseClient } from '@supabase/supabase-js';

// Scrapes AF.com's PUBLIC past-auctions pages to build a local index of
// historical lots. Only touches public URLs — no admin cookie needed.
// Keep this file completely independent of /admin/* flows.

const AF_ORIGIN = 'https://auctionfactory.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AuctionFactoryLotter/1.0';

const FETCH_TIMEOUT_MS = 8000;
// Server-enforced per-page item count on archive_auction_details.php
// (overriding via query param didn't work in testing).
const ITEMS_PER_PAGE = 18;
// Hard safety cap on auction size — AF rarely runs auctions > 1000 lots.
const MAX_ITEM_PAGES_PER_AUCTION = 60;

export interface ScrapedLot {
  af_auction_id: number;
  af_item_id: number;
  // Position on the archive listing page, 1-indexed across all pages.
  // After an auction is relot-synced this equals the auction's final
  // lot number. Used by the archive-import flow so Chase can pick by
  // lot number even though AF doesn't render it on the public page.
  lot_number: number | null;
  item_name: string | null;
  brand: string | null;
  model: string | null;
  condition_rating: string | null;
  retail_new: number | null;
  // Hammer price — "Current Bid: $X" on the public archive page for a
  // closed auction. Null during a live auction or when the lot didn't
  // sell. Combined with retail_new over many lots this feeds the
  // pricing feedback loop: brands where sold/listed < 50% signal that
  // our listed prices are chronically too high.
  sold_price: number | null;
  image_url: string | null;
  lot_href: string;
  // Full long-form auction description — the <p> block right under
  // the item title on the archive listing page. Already per-lot in the
  // public HTML so no second fetch is needed to get it.
  description: string | null;
  width: string | null;
  depth: string | null;
  height: string | null;
}

export interface ScrapedAuction {
  af_auction_id: number;
  title: string | null;
  closed_at: string | null; // ISO
}

async function fetchHtml(url: string): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// Pull one page of past auctions (24 per page). Returns [] when the page
// yields no auction cards.
export async function fetchPastAuctionsPage(pageNum: number): Promise<ScrapedAuction[]> {
  const html = await fetchHtml(`${AF_ORIGIN}/past_auctions.php?pageNum_auction=${pageNum}`);
  const cards = html.split(/<article\s+class="af-browse-card"[^>]*data-auction-id="/i).slice(1);
  const auctions: ScrapedAuction[] = [];
  for (const chunk of cards) {
    const idMatch = chunk.match(/^(\d+)/);
    if (!idMatch) continue;
    const af_auction_id = Number(idMatch[1]);
    if (!af_auction_id) continue;

    // Title lives inside the <h2><a>…</a></h2>.
    const titleMatch = chunk.match(/<h2><a[^>]*>([^<]+)<\/a><\/h2>/);
    const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : null;

    // Close date is in <time datetime="…">; AF includes TZ, so just pass through.
    const timeMatch = chunk.match(/<time\s+datetime="([^"]+)"/);
    let closed_at: string | null = null;
    if (timeMatch) {
      const parsed = new Date(timeMatch[1]);
      if (!Number.isNaN(parsed.getTime())) closed_at = parsed.toISOString();
    }

    auctions.push({ af_auction_id, title, closed_at });
  }
  return auctions;
}

// Walk every page of past_auctions.php until we see an empty page or hit
// `maxPages`. Deduped by af_auction_id.
export async function fetchAllRecentAuctions(maxPages = 10): Promise<ScrapedAuction[]> {
  const seen = new Set<number>();
  const out: ScrapedAuction[] = [];
  for (let p = 0; p < maxPages; p++) {
    const page = await fetchPastAuctionsPage(p);
    if (page.length === 0) break;
    let addedThisPage = 0;
    for (const a of page) {
      if (!seen.has(a.af_auction_id)) {
        seen.add(a.af_auction_id);
        out.push(a);
        addedThisPage++;
      }
    }
    // If every row was a dupe we're seeing the same window twice — stop.
    if (addedThisPage === 0) break;
  }
  return out;
}

// Parse one archive_auction_details.php page's lot blocks.
export function parseAuctionLotsHtml(
  html: string,
  af_auction_id: number
): ScrapedLot[] {
  // Each lot starts with `<div class="itemImage">`. Split there so each
  // chunk holds exactly one lot's markup (title, dims, etc).
  const chunks = html.split(/<div\s+class="itemImage">/i).slice(1);
  const lots: ScrapedLot[] = [];
  for (const chunk of chunks) {
    // The chunk ends at the next lot's boundary or the page footer; take
    // only up to the next `<div class="itemImage">`-ish marker if any.
    const stop = chunk.search(/<div\s+class="row[^"]*(itemBox|itemImage)/i);
    const block = stop > 0 ? chunk.substring(0, stop) : chunk;

    const itemIdMatch = block.match(/item_detail\.php\?item=(\d+)/);
    if (!itemIdMatch) continue;
    const af_item_id = Number(itemIdMatch[1]);
    if (!af_item_id) continue;

    const imgMatch = block.match(/src="(\/uploaded_files[^"]+)"/i);
    const image_url = imgMatch ? `${AF_ORIGIN}${imgMatch[1]}` : null;

    // Item name: first <a> inside <div class="itemName"> that points at
    // item_detail.php. The anchor text is the title.
    const nameBlockMatch = block.match(
      /<div\s+class="itemName">([\s\S]*?)<\/div>/i
    );
    let item_name: string | null = null;
    if (nameBlockMatch) {
      const aMatch = nameBlockMatch[1].match(
        /<a[^>]*item_detail\.php[^>]*>([\s\S]*?)<\/a>/i
      );
      if (aMatch) item_name = cleanText(aMatch[1]);
    }

    // Spec line: <div class="itemDims">
    //   <strong>CONDITION: </strong>7 - Good | <strong>MAKE: </strong>HOSHIZAKI | ...
    const dimsMatch = block.match(/<div\s+class="itemDims">([\s\S]*?)<\/div>/i);
    const dims = dimsMatch ? dimsMatch[1] : '';
    const condition_rating = extractField(dims, 'CONDITION');
    const brand = extractField(dims, 'MAKE');
    const model = extractField(dims, 'MODEL');
    const retailRaw = extractField(dims, 'ORIGINAL PRICE NEW');
    const retail_new = parsePrice(retailRaw);
    const widthRaw = extractField(dims, 'WIDTH');
    const depthRaw = extractField(dims, 'DEPTH');
    const heightRaw = extractField(dims, 'HEIGHT');

    // Description: the <p> block AF renders directly under the title
    // row with features, condition notes, retail line, etc. One <p>
    // per lot. If absent (uncommon) leave null and the importer can
    // proceed with an empty description.
    let description: string | null = null;
    const pMatch = block.match(/<p>([\s\S]*?)<\/p>/i);
    if (pMatch) {
      // Preserve line breaks that AF uses, strip only tags.
      const raw = pMatch[1]
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      if (raw.length >= 10) description = raw;
    }

    // Hammer price. AF renders "Current Bid: $NNN.NN" inside the lot's
    // detail block. On live auctions this is the current bid; on
    // archived (closed) auctions it's the final hammer. We capture
    // regardless and let the caller decide what to do — the archive
    // crawler only visits closed auctions so values stored here are
    // real hammer prices.
    const soldMatch = block.match(/Current\s*Bid\s*:?\s*(?:<[^>]*>)*\s*\$?([\d,]+(?:\.\d+)?)/i);
    const sold_price = soldMatch ? parsePrice(soldMatch[1]) : null;

    const lot_href = `${AF_ORIGIN}/item_detail.php?item=${af_item_id}&auction=${af_auction_id}`;

    lots.push({
      af_auction_id,
      af_item_id,
      // Caller fills this in by position across pages — parser can't
      // know the global index of this lot on its own.
      lot_number: null,
      item_name,
      brand,
      model,
      condition_rating,
      retail_new,
      sold_price,
      image_url,
      lot_href,
      description,
      width: widthRaw || null,
      depth: depthRaw || null,
      height: heightRaw || null,
    });
  }
  return lots;
}

// Fetch every lot of an auction by paginating pageNum_items until an
// empty page.
export async function fetchAuctionLots(af_auction_id: number): Promise<ScrapedLot[]> {
  const all: ScrapedLot[] = [];
  const seenItemIds = new Set<number>();
  for (let page = 0; page < MAX_ITEM_PAGES_PER_AUCTION; page++) {
    const url = `${AF_ORIGIN}/archive_auction_details.php?auction=${af_auction_id}&pageNum_items=${page}`;
    let html: string;
    try {
      html = await fetchHtml(url);
    } catch (err) {
      // One failed page shouldn't kill the whole auction crawl — but if
      // page 0 fails we've got nothing.
      if (page === 0) throw err;
      break;
    }
    const lots = parseAuctionLotsHtml(html, af_auction_id);
    if (lots.length === 0) break;
    let addedThisPage = 0;
    for (const l of lots) {
      if (!seenItemIds.has(l.af_item_id)) {
        seenItemIds.add(l.af_item_id);
        // Fill lot_number by global 1-indexed position. AF's archive
        // page renders lots in their post-relot order, which is the
        // original auction's lot number.
        l.lot_number = all.length + 1;
        all.push(l);
        addedThisPage++;
      }
    }
    // Last page may be partial but if we re-saw lots we've already
    // walked past the end.
    if (addedThisPage === 0) break;
    // Natural end: page returned fewer than a full server page.
    if (lots.length < ITEMS_PER_PAGE) break;
  }
  return all;
}

// Fetch an individual lot's full detail from AF. Tries both admin and
// public pages in order (admin pages carry the full photo set + raw
// description; the public item_detail page is login-gated on closed
// auctions). Picks whichever URL returns the most unique
// /uploaded_files/ photos. Returns null if none of them produces a
// parseable detail — caller should fall back to the archive thumbnail.
async function fetchAuthedHtml(url: string, cookie: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        Cookie: cookie,
      },
      redirect: 'manual',
      signal: ctrl.signal,
    });
    if (res.status === 302 || res.status === 301) return null;
    if (!res.ok) return null;
    const html = await res.text();
    // Skip pages that bounced to the login form.
    if (/name=["']psEmail["']|name=["']psPassword["']/i.test(html.substring(0, 5000))) {
      return null;
    }
    return html;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// Fetch every /uploaded_files/item_* image belonging to this lot.
//
// Strategy:
//  1. Try several candidate AF URLs in parallel — the public
//     item_detail page is the most likely source (item-scoped),
//     with admin edit variants as backup.
//  2. For each page that returned HTML, locate an ANCHOR — the
//     first position where this lot's own brand/model/title text
//     appears. These strings came from the archive listing, so
//     anywhere they occur is text belonging to THIS item.
//  3. Extract only /uploaded_files/item_*.ext references within a
//     bounded window on both sides of the anchor. This keeps
//     nav/sidebar/header imagery out even if the admin page serves
//     it, because those are at the top of the document far from
//     the item's own text block.
//  4. Cross-reference filter against other lots' archive thumbnails
//     as a final defense.
//  5. Pick the URL that yielded the most anchored, filtered images.
//
// Returns [] on total failure so the import proceeds with the
// archive thumbnail alone.
export async function fetchLotImagesAuthed(
  af_item_id: number,
  af_auction_id: number,
  cookie: string,
  otherLotsThumbs: Set<string>,
  anchorText: string[],
): Promise<{ urls: string[]; sourceUrl: string | null; debug: string }> {
  const candidateUrls = [
    `${AF_ORIGIN}/item_detail.php?item=${af_item_id}&auction=${af_auction_id}`,
    `${AF_ORIGIN}/item_detail.php?item=${af_item_id}`,
    `${AF_ORIGIN}/admin/edit_item_3.php?item=${af_item_id}`,
    `${AF_ORIGIN}/admin/edit_item.php?item=${af_item_id}`,
  ];

  const results = await Promise.all(
    candidateUrls.map(async (url) => {
      const html = await fetchAuthedHtml(url, cookie);
      if (!html) return { url, urls: [], htmlLen: 0 };
      const urls = extractImagesAroundAnchor(html, anchorText, otherLotsThumbs);
      return { url, urls, htmlLen: html.length };
    }),
  );

  // Pick the URL that yielded the most unique, filtered images.
  let best = results[0];
  for (const r of results) {
    if (r.urls.length > best.urls.length) best = r;
  }

  const debug = results
    .map((r) => `${r.url.replace(AF_ORIGIN, '')} → ${r.urls.length} (${r.htmlLen}b)`)
    .join('; ');

  return {
    urls: best.urls,
    sourceUrl: best.urls.length > 0 ? best.url : null,
    debug,
  };
}

// Pull /uploaded_files/item_* image URLs that sit WITHIN a bounded
// window of one of the given anchor strings in the HTML. Anchor
// strings are the lot's own brand/model/title — any image near text
// we know belongs to this item almost certainly belongs to it too.
// Also filters out any URL that matches another lot's archive
// thumbnail as a secondary defense.
function extractImagesAroundAnchor(
  html: string,
  anchorText: string[],
  otherLotsThumbs: Set<string>,
): string[] {
  // Normalize anchor candidates — strip the "($N)" suffix AF adds and
  // drop short or empty entries that would false-match. Need at least
  // 4 chars so we don't anchor on common substrings.
  const anchors = anchorText
    .map((s) => (s || '')
      .replace(/\s*\(\s*\$[\d,]+(?:\.\d{2})?\s*\)\s*$/i, '')
      .trim())
    .filter((s) => s.length >= 4);

  const WINDOW = 6000; // chars either side of anchor
  const spans: Array<[number, number]> = [];
  for (const needle of anchors) {
    let idx = 0;
    while (idx < html.length) {
      const found = html.indexOf(needle, idx);
      if (found < 0) break;
      spans.push([Math.max(0, found - WINDOW), Math.min(html.length, found + WINDOW)]);
      idx = found + needle.length;
    }
  }

  // If no anchor matched, don't blindly scan the whole doc — that's
  // what caused the cross-lot bleed. Return empty; caller falls back
  // to the archive thumbnail.
  if (spans.length === 0) return [];

  // Merge overlapping spans so we scan each byte at most once.
  spans.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [s, e] of spans) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) {
      last[1] = Math.max(last[1], e);
    } else {
      merged.push([s, e]);
    }
  }

  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\/uploaded_files\d*\/item_[^\s"'<>)]+\.(?:jpg|jpeg|png|webp|gif)/gi;
  for (const [s, e] of merged) {
    const region = html.substring(s, e);
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(region)) !== null) {
      const u = `${AF_ORIGIN}${m[0]}`;
      if (seen.has(u)) continue;
      seen.add(u);
      if (otherLotsThumbs.has(u)) continue;
      out.push(u);
      if (out.length >= 30) return out;
    }
  }
  return out;
}

export interface ReindexOptions {
  // Which past_auctions.php page to start at (0 = most recent 24).
  fromPage: number;
  // How many past_auctions.php pages to walk from `fromPage`. Each page
  // is 24 auctions, each auction is up to ~1000 lots.
  pagesToProcess: number;
  // If true, skip auctions already present in af_archive_auctions whose
  // last_crawled_at is set. Use for nightly refresh so we don't re-crawl
  // every auction every night.
  skipKnown: boolean;
  // Max auctions to actually crawl in one call (hard cap to avoid Vercel
  // function timeouts). The orchestrator returns a cursor for the admin
  // UI to continue from.
  maxAuctions: number;
  // Soft wall-clock budget in ms. The orchestrator returns a cursor as
  // soon as elapsed time exceeds this, regardless of how many auctions
  // are still to go. Set below the Vercel function timeout so the client
  // sees a cursor instead of a 504. Default 50_000 (10s under the 60s
  // Hobby plan cap).
  timeBudgetMs?: number;
}

export interface ReindexResult {
  auctions_scanned: number;
  auctions_crawled: number;
  auctions_skipped: number;
  lots_upserted: number;
  errors: { af_auction_id: number; error: string }[];
  next_page: number | null;
  next_auction_offset: number | null;
}

// Orchestrates a reindex: walk past_auctions pages, decide which auctions
// to crawl, fetch their lots, upsert into Supabase. Returns a cursor for
// the admin UI to continue from.
export async function reindexArchive(
  serviceClient: SupabaseClient,
  opts: ReindexOptions
): Promise<ReindexResult> {
  const result: ReindexResult = {
    auctions_scanned: 0,
    auctions_crawled: 0,
    auctions_skipped: 0,
    lots_upserted: 0,
    errors: [],
    next_page: null,
    next_auction_offset: null,
  };

  let crawledThisCall = 0;
  const startedAt = Date.now();
  const timeBudgetMs = opts.timeBudgetMs ?? 50_000;
  const timeExhausted = () => Date.now() - startedAt > timeBudgetMs;

  for (let p = opts.fromPage; p < opts.fromPage + opts.pagesToProcess; p++) {
    let page: ScrapedAuction[];
    try {
      page = await fetchPastAuctionsPage(p);
    } catch (err: any) {
      result.errors.push({ af_auction_id: -1, error: `page ${p}: ${err?.message || err}` });
      break;
    }
    if (page.length === 0) {
      // No more pages.
      result.next_page = null;
      break;
    }
    result.auctions_scanned += page.length;

    // Register auctions in the bookkeeping table so we can show them in
    // the admin UI even before their lots are crawled.
    await serviceClient
      .from('af_archive_auctions')
      .upsert(
        page.map((a) => ({
          af_auction_id: a.af_auction_id,
          title: a.title,
          closed_at: a.closed_at,
        })),
        { onConflict: 'af_auction_id', ignoreDuplicates: false }
      );

    // If skipKnown, filter out auctions that have been crawled before.
    let toCrawl = page;
    if (opts.skipKnown) {
      const { data: known } = await serviceClient
        .from('af_archive_auctions')
        .select('af_auction_id, last_crawled_at')
        .in(
          'af_auction_id',
          page.map((a) => a.af_auction_id)
        );
      const knownSet = new Set(
        (known || [])
          .filter((k: any) => k.last_crawled_at != null)
          .map((k: any) => k.af_auction_id)
      );
      const skippedCount = page.filter((a) => knownSet.has(a.af_auction_id)).length;
      result.auctions_skipped += skippedCount;
      toCrawl = page.filter((a) => !knownSet.has(a.af_auction_id));
    }

    for (const a of toCrawl) {
      // Return early with a cursor if we've hit maxAuctions OR run out of
      // wall-clock budget. The second case is critical: a single large
      // auction (300+ lots across 20+ page fetches) could blow past the
      // Vercel 60s function timeout mid-work and leave the admin loop
      // staring at a 504 with no way to resume. Checking before we start
      // the next auction keeps every call returning cleanly.
      if (crawledThisCall >= opts.maxAuctions || timeExhausted()) {
        result.next_page = p;
        const idx = page.findIndex((x) => x.af_auction_id === a.af_auction_id);
        result.next_auction_offset = idx;
        return result;
      }
      try {
        const lots = await fetchAuctionLots(a.af_auction_id);
        if (lots.length > 0) {
          // Upsert in chunks of 500 to keep requests small.
          for (let i = 0; i < lots.length; i += 500) {
            const chunk = lots.slice(i, i + 500);
            const { error } = await serviceClient
              .from('af_archive_items')
              .upsert(
                chunk.map((l) => ({
                  ...l,
                  auction_title: a.title,
                  auction_closed_at: a.closed_at,
                  indexed_at: new Date().toISOString(),
                })),
                { onConflict: 'af_auction_id,af_item_id', ignoreDuplicates: false }
              );
            if (error) throw error;
            result.lots_upserted += chunk.length;
          }
        }
        await serviceClient
          .from('af_archive_auctions')
          .update({
            last_crawled_at: new Date().toISOString(),
            item_count: lots.length,
            last_crawl_error: null,
          })
          .eq('af_auction_id', a.af_auction_id);
        result.auctions_crawled += 1;
      } catch (err: any) {
        const msg = err?.message || String(err);
        result.errors.push({ af_auction_id: a.af_auction_id, error: msg });
        await serviceClient
          .from('af_archive_auctions')
          .update({ last_crawl_error: msg.substring(0, 500) })
          .eq('af_auction_id', a.af_auction_id);
      }
      crawledThisCall++;
    }

    // If we fell off the end of this page without hitting maxAuctions,
    // the next call should start at the next page.
    result.next_page = p + 1;
    result.next_auction_offset = 0;
  }

  return result;
}

// Look up archived lots that match a brand+model. Normalizes the inputs
// so trivial case/space differences don't miss a match.
export async function searchAFArchiveIndex(
  supabase: SupabaseClient,
  brand: string,
  model: string
): Promise<{ image_url: string; item_name: string; retail_new: number | null; lot_href: string }[]> {
  const b = (brand || '').trim();
  const m = (model || '').trim();
  if (!b && !m) return [];

  // Primary: exact-ish ILIKE both brand and model (preserves PG planner's
  // use of the trigram index).
  let query = supabase
    .from('af_archive_items')
    .select('image_url, item_name, retail_new, lot_href, indexed_at')
    .not('image_url', 'is', null)
    .order('indexed_at', { ascending: false })
    .limit(10);
  if (b) query = query.ilike('brand', `%${b}%`);
  if (m) query = query.ilike('model', `%${m}%`);

  const { data, error } = await query;
  if (error || !data) return [];
  return data.map((row: any) => ({
    image_url: row.image_url,
    item_name: row.item_name,
    retail_new: row.retail_new,
    lot_href: row.lot_href,
  }));
}

// --- helpers ----------------------------------------------------------

function extractField(html: string, label: string): string | null {
  // Match a <strong>LABEL: </strong>value sequence up to the next <strong>
  // or end of block. Non-greedy, case insensitive.
  const re = new RegExp(
    `<strong>\\s*${label}\\s*:\\s*<\\/strong>([\\s\\S]*?)(?=<strong>|<\\/div>|$)`,
    'i'
  );
  const m = html.match(re);
  if (!m) return null;
  const cleaned = cleanText(m[1]).replace(/\|\s*$/, '').trim();
  return cleaned || null;
}

function cleanText(s: string): string {
  return decodeEntities(s.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—');
}

function parsePrice(s: string | null): number | null {
  if (!s) return null;
  const m = s.match(/\$?([\d,]+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}
