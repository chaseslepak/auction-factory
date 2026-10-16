// Admin-flow AF item lister.
//
// Reads AF's authenticated admin endpoints to get the (af_item_id,
// title, lot_number) tuples for an auction. Compared to the public
// `auction_details.php` scraper in src/lib/af-scraper.ts, this
// source is:
//
//   - More stable — the admin's relot_auction.php table structure has
//     changed less often than the buyer-facing page layout.
//   - Authoritative on `af_item_id` — the public scraper only gets
//     the id from a link href; the admin page lists it as the row key.
//
// The public scraper remains the fallback when no AF session cookie
// is available. The audit route prefers this source when it can.

const AF_BASE = 'https://auctionfactory.com/admin';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface AdminItem {
  af_item_id: number;
  // Display title AF has on file for this item. Normalized version is
  // used for matching when af_item_id isn't available on the lotter
  // side (e.g. pre-phase15 rows).
  title: string;
  lot_number: number | null;
}

// Parse the (af_item_id, title, lot_number) rows out of AF's
// relot_auction.php page. Returns one row per newlot[] input.
export function parseAdminItemList(html: string): AdminItem[] {
  const items: AdminItem[] = [];
  // Find the form containing newlot[] inputs — mirrors the parser in
  // src/app/api/relot-sync/[id]/route.ts but returns a simpler shape.
  const formRegex = /<form\b[^>]*>([\s\S]*?)<\/form>/gi;
  let m: RegExpExecArray | null;
  let formInner = '';
  while ((m = formRegex.exec(html)) !== null) {
    if (/name=["']newlot\[/i.test(m[1])) {
      formInner = m[1];
      break;
    }
  }
  if (!formInner) return items;

  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let r: RegExpExecArray | null;
  while ((r = rowRegex.exec(formInner)) !== null) {
    const rowHtml = r[1];
    const inputMatch = rowHtml.match(
      /<input\b[^>]*\bname=["']newlot\[([^\]]+)\]["'][^>]*>/i
    );
    if (!inputMatch) continue;
    const af_item_id = Number(inputMatch[1]);
    if (!Number.isFinite(af_item_id) || af_item_id <= 0) continue;

    const currentValM = inputMatch[0].match(/\bvalue=["']([^"']*)["']/i);
    const lotNumRaw = currentValM ? currentValM[1] : '';
    const lot_number = /^\d+$/.test(lotNumRaw) ? Number(lotNumRaw) : null;

    // Row's first td text = item title (same convention as relot-sync).
    const cellRegex = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    const cells: string[] = [];
    let c: RegExpExecArray | null;
    while ((c = cellRegex.exec(rowHtml)) !== null) {
      cells.push(c[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());
    }
    const title = cells[0] || '';
    items.push({ af_item_id, title, lot_number });
  }
  return items;
}

// Fetch + parse AF's admin item list for an auction. Requires a valid
// AF session cookie. Throws on redirect-to-login or non-200 so the
// caller can distinguish "auction is empty" from "we got bounced."
export async function fetchAdminItemList(
  afAuctionId: string | number,
  cookie: string
): Promise<AdminItem[]> {
  const url = `${AF_BASE}/relot_auction.php?auction=${afAuctionId}&relot=Re-Lot`;
  const res = await fetch(url, {
    headers: {
      Cookie: cookie,
      'User-Agent': BROWSER_UA,
      Accept: 'text/html',
    },
    redirect: 'manual',
  });
  if (res.status === 302 || res.status === 301) {
    throw new Error(
      `AF admin item list redirected to ${res.headers.get('location') || '(no location)'} — session likely expired.`
    );
  }
  if (res.status !== 200) {
    throw new Error(`AF admin item list returned HTTP ${res.status}`);
  }
  const html = await res.text();
  // Login-marker check (same signature as af-session validator).
  if (/name=["']psEmail["']|name=["']psPassword["']/i.test(html.substring(0, 5000))) {
    throw new Error('AF admin item list body shows login form — session expired.');
  }
  return parseAdminItemList(html);
}

// Normalize an item title for cross-source matching. Mirrors the
// relot-sync normalizer so admin ↔ lotter comparisons agree.
export function normalizeTitle(s: string | null | undefined): string {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
