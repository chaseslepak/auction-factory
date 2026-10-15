import { SupabaseClient } from '@supabase/supabase-js';

// Scrapes AF.com's PUBLIC past-auctions pages to build a local index of
// historical lots. Only touches public URLs — no admin cookie needed.
// Keep this file completely independent of /admin/* flows.

const AF_ORIGIN = 'https://auctionfactory.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AuctionFactoryLotter/1.0';

const FETCH_TIMEOUT_MS = 15000;
// Server-enforced per-page item count on archive_auction_details.php
// (overriding via query param didn't work in testing).
const ITEMS_PER_PAGE = 18;
// Hard safety cap on auction size — AF rarely runs auctions > 1000 lots.
const MAX_ITEM_PAGES_PER_AUCTION = 60;

export interface ScrapedLot {
  af_auction_id: number;
  af_item_id: number;
  item_name: string | null;
  brand: string | null;
  model: string | null;
  condition_rating: string | null;
  retail_new: number | null;
  image_url: string | null;
  lot_href: string;
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

    const lot_href = `${AF_ORIGIN}/item_detail.php?item=${af_item_id}&auction=${af_auction_id}`;

    lots.push({
      af_auction_id,
      af_item_id,
      item_name,
      brand,
      model,
      condition_rating,
      retail_new,
      image_url,
      lot_href,
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
      if (crawledThisCall >= opts.maxAuctions) {
        // Save cursor and exit — admin UI continues from here.
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
