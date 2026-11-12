import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// One-shot diagnostic endpoint for the import-from-archive scraper.
//
// Hit it from a browser while signed into the lotter:
//   /api/admin/af-detail-probe?item=386526&auction=4967
//
// Fetches AF's candidate detail URLs with the stored admin cookie
// and returns a JSON report showing — per URL — the status, HTML
// length, count of /uploaded_files/item_* image refs, whether the
// `item=<id>` anchor is present, and a 500-char slice of HTML AROUND
// each anchor + image occurrence. Enough for the image-scraper
// author (hi) to see the real authed layout and tune the extractor
// against reality instead of guessing.
//
// Read-only. Login-gated to lotter users. Never writes anywhere.

const AF_ORIGIN = 'https://auctionfactory.com';
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AuctionFactoryLotter/1.0';

async function fetchAuthed(url: string, cookie: string): Promise<{ status: number; html: string | null }> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html', Cookie: cookie },
      redirect: 'manual',
    });
    if (res.status === 302 || res.status === 301) return { status: res.status, html: null };
    const html = await res.text();
    return { status: res.status, html };
  } catch (err: any) {
    return { status: 0, html: `FETCH_ERROR: ${err?.message || err}` };
  }
}

function analyze(html: string, af_item_id: number) {
  const anchor = `item=${af_item_id}`;
  const anchorIdx: number[] = [];
  let i = 0;
  while (i < html.length) {
    const f = html.indexOf(anchor, i);
    if (f < 0) break;
    anchorIdx.push(f);
    i = f + anchor.length;
    if (anchorIdx.length >= 15) break;
  }

  const imgRe = /\/uploaded_files\d*\/item_[^\s"'<>)]+\.(?:jpg|jpeg|png|webp|gif)/gi;
  const imgs: Array<{ url: string; pos: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    imgs.push({ url: m[0], pos: m.index });
    if (imgs.length >= 30) break;
  }

  // Grab ~300 chars either side of the first anchor and the first image
  // so we can see the surrounding markup structure.
  const sample = (center: number, radius = 350): string => {
    const s = Math.max(0, center - radius);
    const e = Math.min(html.length, center + radius);
    return html.substring(s, e);
  };

  return {
    htmlLen: html.length,
    isLoginPage: /name=["']psEmail["']|name=["']psPassword["']/i.test(html.substring(0, 5000)),
    anchorCount: anchorIdx.length,
    anchorPositions: anchorIdx,
    anchorFirstContext: anchorIdx.length > 0 ? sample(anchorIdx[0]) : null,
    imageCount: imgs.length,
    imageUrls: imgs.map((x) => x.url),
    imagePositions: imgs.map((x) => x.pos),
    imageFirstContext: imgs.length > 0 ? sample(imgs[0].pos) : null,
    // Cheap heuristic for whether images and anchor cluster together.
    // Distance from first anchor to nearest image.
    distanceAnchorToNearestImage: (anchorIdx.length > 0 && imgs.length > 0)
      ? Math.min(...imgs.map((x) => Math.abs(x.pos - anchorIdx[0])))
      : null,
  };
}

export async function GET(req: NextRequest) {
  const userClient = createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return NextResponse.json({ error: 'No service key' }, { status: 500 });
  const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const af_item_id = Number(req.nextUrl.searchParams.get('item'));
  const af_auction_id = Number(req.nextUrl.searchParams.get('auction') || 0);
  if (!Number.isFinite(af_item_id) || af_item_id <= 0) {
    return NextResponse.json({ error: 'item=<af_item_id> required' }, { status: 400 });
  }

  // Load + decrypt the stored AF admin cookie (same path the executor uses).
  const { data: session } = await supabase
    .from('af_session').select('session_cookie').eq('id', 1).single();
  if (!session?.session_cookie) {
    return NextResponse.json({ error: 'No AF session cookie stored' }, { status: 400 });
  }
  let cookie = session.session_cookie as string;
  try {
    const { decrypt } = await import('@/lib/crypto');
    cookie = decrypt(cookie);
  } catch {}

  const candidates = [
    `${AF_ORIGIN}/item_detail.php?item=${af_item_id}${af_auction_id ? `&auction=${af_auction_id}` : ''}`,
    `${AF_ORIGIN}/item_detail.php?item=${af_item_id}`,
    `${AF_ORIGIN}/admin/edit_item.php?item=${af_item_id}`,
    `${AF_ORIGIN}/admin/edit_item_1.php?item=${af_item_id}`,
    `${AF_ORIGIN}/admin/edit_item_2.php?item=${af_item_id}`,
    `${AF_ORIGIN}/admin/edit_item_3.php?item=${af_item_id}`,
    `${AF_ORIGIN}/admin/item_photos.php?item=${af_item_id}`,
    `${AF_ORIGIN}/admin/photos.php?item=${af_item_id}`,
  ];

  const results = await Promise.all(
    candidates.map(async (url) => {
      const r = await fetchAuthed(url, cookie);
      if (r.status !== 200 || !r.html) {
        return { url, status: r.status, error: r.html?.startsWith('FETCH_ERROR') ? r.html : 'non-200 or no body' };
      }
      return { url, status: r.status, ...analyze(r.html, af_item_id) };
    }),
  );

  return NextResponse.json({
    af_item_id,
    af_auction_id,
    cookie_preview: cookie.substring(0, 40) + '...',
    results,
  });
}
