import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const AF_BASE = 'https://auctionfactory.com/admin';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Fetch list of auctions from AF admin so the "Link AF Auction" dropdown
// in the lotter can show them.
//
// Historically this page was `admin/add_item.php`, which embeds a
// <select name="auction"> with every open auction as an <option>. If AF
// moves the dropdown or restyles the <option> tags (adds a class, swaps
// attribute order, etc.), the old strict regex silently returns [].
//
// Current approach: try several candidate pages, run a tolerant parser
// on each, and surface diagnostics in the error response so we can see
// WHY it came back empty next time this breaks.
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: session } = await supabase
    .from('af_session')
    .select('session_cookie')
    .eq('id', 1)
    .single();

  if (!session?.session_cookie) {
    return NextResponse.json({ error: 'Not connected to AF' }, { status: 400 });
  }

  let cookie = session.session_cookie;
  try {
    const { decrypt } = await import('@/lib/crypto');
    cookie = decrypt(cookie);
  } catch {}

  // Try each candidate URL until one yields auctions. Order matters —
  // historically `add_item.php` is the canonical source.
  const candidates = [
    `${AF_BASE}/add_item.php`,
    `${AF_BASE}/add_item_2new.php`,
    `${AF_BASE}/auctions.php`,
    `${AF_BASE}/index.php`,
  ];

  const diagnostics: Array<{
    url: string;
    http_status: number;
    content_length: number;
    option_count: number;
    auction_count: number;
    sample_options: string[];
  }> = [];
  let sessionExpired = false;

  for (const url of candidates) {
    try {
      const res = await fetch(url, {
        headers: {
          Cookie: cookie,
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'manual',
      });

      if (res.status === 302 || res.status === 301) {
        // AF redirects unauthenticated requests to the login page. If every
        // candidate redirects, treat the session as expired.
        sessionExpired = true;
        diagnostics.push({
          url,
          http_status: res.status,
          content_length: 0,
          option_count: 0,
          auction_count: 0,
          sample_options: [],
        });
        continue;
      }

      const html = await res.text();

      // Login page body check — AF sometimes returns 200 with the login
      // form instead of redirecting.
      if (/name=["']psEmail["']|name=["']psPassword["']/i.test(html)) {
        sessionExpired = true;
        diagnostics.push({
          url,
          http_status: res.status,
          content_length: html.length,
          option_count: 0,
          auction_count: 0,
          sample_options: ['(login page served)'],
        });
        continue;
      }

      const auctions = parseAuctionOptions(html);
      // Count all <option> tags for diagnostics even if none parse.
      const allOptionTags = html.match(/<option\b[^>]*>/gi) || [];
      diagnostics.push({
        url,
        http_status: res.status,
        content_length: html.length,
        option_count: allOptionTags.length,
        auction_count: auctions.length,
        sample_options: allOptionTags.slice(0, 5),
      });

      if (auctions.length > 0) {
        return NextResponse.json({ auctions });
      }
    } catch (err: any) {
      diagnostics.push({
        url,
        http_status: 0,
        content_length: 0,
        option_count: 0,
        auction_count: 0,
        sample_options: [`FETCH_ERROR: ${err?.message || err}`],
      });
    }
  }

  // Nothing worked.
  if (sessionExpired) {
    return NextResponse.json(
      { error: 'AF session expired. Reconnect your AF account in Settings.', diagnostics },
      { status: 401 }
    );
  }
  return NextResponse.json(
    {
      error:
        'AF returned pages but no auction options were parseable. AF may have changed its dropdown structure — paste the diagnostics to Chase.',
      diagnostics,
    },
    { status: 502 }
  );
}

// Pull the auction options out of an HTML page. Looks for a <select>
// whose name hints at being the auction picker (name/id contains
// "auction"), then grabs every <option value="<digits>">Name</option>
// inside it. Tolerates:
// - Any attribute order inside the <select> and <option> tags
// - Classes, data-* attributes, selected markers on <option>
// - Mixed-case tag names
// - Extra whitespace
// - Options whose value is non-numeric (filters those out — AF auction
//   IDs are always integers)
// Also falls back to parsing options even without the enclosing <select>
// marker if nothing was found that way.
function parseAuctionOptions(html: string): { id: string; name: string }[] {
  const results: { id: string; name: string }[] = [];
  const seen = new Set<string>();

  // Prefer a <select> whose name/id references "auction". AF may add
  // classes, data-* attrs, etc. — be forgiving.
  const selectRe = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  let m: RegExpExecArray | null;
  const auctionSelectBodies: string[] = [];
  while ((m = selectRe.exec(html)) !== null) {
    const attrs = m[1];
    if (/\b(?:name|id)=["'][^"']*auction/i.test(attrs)) {
      auctionSelectBodies.push(m[2]);
    }
  }

  const bodies = auctionSelectBodies.length ? auctionSelectBodies : [html];
  for (const body of bodies) {
    const optionRe = /<option\b([^>]*?)>([\s\S]*?)<\/option>/gi;
    let o: RegExpExecArray | null;
    while ((o = optionRe.exec(body)) !== null) {
      const attrs = o[1];
      const text = stripHtml(o[2]).trim();
      if (!text) continue;
      const valueMatch = attrs.match(/\bvalue=["']?([^"'\s>]+)["']?/i);
      if (!valueMatch) continue;
      const value = valueMatch[1];
      // AF auction IDs are integers. Filter out non-numeric placeholders
      // like "" / "0" / "-- select --" rows.
      if (!/^\d+$/.test(value)) continue;
      if (value === '0') continue;
      if (seen.has(value)) continue;
      seen.add(value);
      results.push({ id: value, name: text });
    }
    if (results.length > 0) break;
  }

  return results;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ');
}
