import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { fetchLotImagesAuthed, fetchAuctionLots, ScrapedLot } from '@/lib/af-archive';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// AF photo fetch uses the same session cookie for auth-gated detail
// pages, since AF serves uploaded_files via the same host/session.
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AuctionFactoryLotter/1.0';

interface ImportResult {
  af_item_id: number;
  destination_lot_number: number;
  success: boolean;
  photos_uploaded: number;
  error?: string;
}

// POST {
//   auction_id: string,          // destination lotter auction uuid
//   af_auction_id: number,       // source AF archive auction id
//   start_lot_number: number,    // where to start numbering in destination
//   af_item_ids: number[],       // picked lots, in the order to assign
// }
//
// For each picked lot: fetch full detail (authed), insert into the
// destination auction at start_lot_number + i, download every photo
// and attach as lot_photos rows. Best-effort per lot — a single lot's
// failure doesn't abort the batch.
export async function POST(req: NextRequest) {
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }
  const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const auction_id = String(body?.auction_id || '');
  const af_auction_id = Number(body?.af_auction_id);
  const start_lot_number = Number(body?.start_lot_number);
  const af_item_ids: number[] = Array.isArray(body?.af_item_ids)
    ? body.af_item_ids.map(Number).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];

  if (!auction_id) return NextResponse.json({ error: 'auction_id required' }, { status: 400 });
  if (!Number.isFinite(af_auction_id) || af_auction_id <= 0) {
    return NextResponse.json({ error: 'af_auction_id required' }, { status: 400 });
  }
  if (!Number.isFinite(start_lot_number) || start_lot_number < 1) {
    return NextResponse.json({ error: 'start_lot_number required' }, { status: 400 });
  }
  if (af_item_ids.length === 0) {
    return NextResponse.json({ error: 'af_item_ids required' }, { status: 400 });
  }
  // Server-side cap: 5 lots per call. Each lot now does exactly one
  // description fetch (~3s) and one photo download (~1s) — much
  // lighter than the old multi-URL + full-gallery version.
  // 5 × ~5s ≈ 25s, well inside Vercel's 60s cap.
  if (af_item_ids.length > 5) {
    return NextResponse.json(
      { error: 'Max 5 lots per import batch — split into multiple calls.' },
      { status: 400 },
    );
  }

  // Load AF admin cookie for authed item_detail fetches + photo
  // downloads. Decrypt if the stored value is encrypted.
  const { data: session } = await supabase
    .from('af_session')
    .select('session_cookie')
    .eq('id', 1)
    .single();
  if (!session?.session_cookie) {
    return NextResponse.json(
      { error: 'No AF session cookie stored. Connect your AF account first.' },
      { status: 400 },
    );
  }
  let cookie = session.session_cookie as string;
  try {
    const { decrypt } = await import('@/lib/crypto');
    cookie = decrypt(cookie);
  } catch {}

  // Log a top-level marker so Vercel runtime logs make it easy to grep
  // this endpoint's activity. User-visible errors still return through
  // the normal result array, but this + the per-lot error logs below
  // let Chase pull the real reasons from the Vercel dashboard without
  // needing a client hard-refresh.
  console.log(
    `[IMPORT-ARCHIVE] start auction_id=${auction_id} af_auction_id=${af_auction_id} ` +
    `start_lot_number=${start_lot_number} count=${af_item_ids.length} ` +
    `cookie_present=${!!cookie}`,
  );

  // Fallback-source lookup: if the authed detail scrape yields no
  // image URLs, use the archive page's thumbnail as a one-photo
  // fallback. Scan once up front — avoids N re-crawls below.
  let archiveIndex: Map<number, ScrapedLot> | null = null;
  try {
    const scanned = await fetchAuctionLots(af_auction_id);
    archiveIndex = new Map(scanned.map((l) => [l.af_item_id, l]));
    console.log(`[IMPORT-ARCHIVE] archive-index loaded (${scanned.length} lots)`);
  } catch (err: any) {
    archiveIndex = null;
    console.error(`[IMPORT-ARCHIVE] archive-index FAILED: ${err?.message || err}`);
  }

  const results: ImportResult[] = [];

  for (let i = 0; i < af_item_ids.length; i++) {
    const af_item_id = af_item_ids[i];
    const destination_lot_number = start_lot_number + i;

    try {
      // All lot metadata comes from the public archive index — it is
      // scraped per-item from AF's own archive listing, so a lot's
      // title / brand / model / condition / retail / primary photo are
      // guaranteed to belong to that lot (no sidebar bleed).
      const archiveLot = archiveIndex?.get(af_item_id) ?? null;
      if (!archiveLot) {
        results.push({
          af_item_id,
          destination_lot_number,
          success: false,
          photos_uploaded: 0,
          error: `Item ${af_item_id} not found in AF archive auction ${af_auction_id}. Did the auction id change?`,
        });
        continue;
      }

      const item_name = archiveLot.item_name || `Imported lot ${af_item_id}`;
      const brand = archiveLot.brand || '';
      const model = archiveLot.model || '';
      const retail = archiveLot.retail_new ?? 0;

      // Condition is "N - Label" on the archive page; peel the leading
      // integer. Default to 5 (well-used) when nothing parses.
      let condition_rating: number | null = null;
      if (archiveLot.condition_rating) {
        const m = String(archiveLot.condition_rating).match(/(\d{1,2})/);
        if (m) {
          const n = Number(m[1]);
          if (n >= 1 && n <= 10) condition_rating = n;
        }
      }

      // Description: lives on the public archive page already (the <p>
      // block below the title). No extra fetch needed.
      const description = archiveLot.description || '';
      const width = archiveLot.width || null;
      const depth = archiveLot.depth || null;
      const height = archiveLot.height || null;

      // listed_price: parse the source title's "($N)" suffix when
      // present (that is what the source actually listed at); fall
      // back to retail. Keeps 0 from showing up when we have usable
      // data.
      let listedPrice = 0;
      const priceInTitle = item_name.match(/\$\s*([\d,]+(?:\.\d{2})?)\s*\)/);
      if (priceInTitle) {
        listedPrice = Number(priceInTitle[1].replace(/,/g, '')) || 0;
      }
      if (!listedPrice && retail > 0) listedPrice = retail;

      // Photos: fetch candidate AF pages and extract images only in
      // proximity to text we KNOW belongs to this item (its own brand
      // / model / title from the archive). That is the most defensive
      // signal available without live visibility into the authed HTML:
      // nav bars and sidebars live far from the item's own content
      // block, so an anchor-scoped window reliably excludes them.
      // Cross-reference filter against other lots' archive thumbnails
      // is kept as a final defense. Fall back to the archive thumbnail
      // if nothing anchored matched so the lot always gets a photo.
      const otherLotsThumbs = new Set<string>();
      if (archiveIndex) {
        archiveIndex.forEach((otherLot, otherAfItemId) => {
          if (otherAfItemId === af_item_id) return;
          if (otherLot.image_url) otherLotsThumbs.add(otherLot.image_url);
        });
      }
      const anchorText = [model, brand, item_name].filter(Boolean) as string[];
      const imgResult = await fetchLotImagesAuthed(
        af_item_id,
        af_auction_id,
        cookie,
        otherLotsThumbs,
        anchorText,
      );
      let image_urls = imgResult.urls;
      let photoSource = imgResult.sourceUrl ? 'authed' : 'thumb-fallback';
      if (image_urls.length === 0 && archiveLot.image_url) {
        image_urls = [archiveLot.image_url];
      }
      console.log(
        `[IMPORT-ARCHIVE] lot af_item_id=${af_item_id} → dest #${destination_lot_number} ` +
        `photos=${image_urls.length} (source=${photoSource}) probes=[${imgResult.debug}] ` +
        `desc_len=${description.length} retail=${retail}`,
      );

      // Hard-delete any soft-deleted lot at the destination slot so the
      // unique (auction_id, lot_number) constraint has room.
      await supabase
        .from('lots')
        .delete()
        .eq('auction_id', auction_id)
        .eq('lot_number', destination_lot_number)
        .not('deleted_at', 'is', null);

      const { data: lotRow, error: lotErr } = await supabase
        .from('lots')
        .insert({
          auction_id,
          lot_number: destination_lot_number,
          item_name: item_name.substring(0, 255),
          brand,
          model,
          category: '',
          confidence: 'high',
          condition_rating: condition_rating ?? 5,
          quantity: 1,
          estimated_retail_new: retail ?? 0,
          listed_price: listedPrice,
          width,
          depth,
          height,
          key_features: [],
          auction_description: description,
          notes: `Imported from AF archive auction ${af_auction_id}, item ${af_item_id}`,
          // lots.created_by is NOT NULL with default auth.uid(). The
          // service-role client doesn't carry a user, so auth.uid()
          // comes back null and every insert would violate the
          // constraint. Pass the signed-in user explicitly.
          created_by: user.id,
        })
        .select()
        .single();

      if (lotErr || !lotRow) {
        results.push({
          af_item_id,
          destination_lot_number,
          success: false,
          photos_uploaded: 0,
          error: lotErr?.message || 'insert failed',
        });
        continue;
      }

      // Download + upload every photo IN PARALLEL within one lot.
      // Previous sequential loop meant a 10-photo lot took 10-20s of
      // wall-clock just on photos, enough to push a 5-lot batch past
      // Vercel's 60s function cap (504). Parallel caps per-lot photo
      // time at the slowest single photo (~2s).
      const photoResults = await Promise.all(
        image_urls.map(async (url, p) => {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 8000);
          try {
            const res = await fetch(url, {
              headers: { 'User-Agent': UA, Cookie: cookie },
              signal: ctrl.signal,
            });
            if (!res.ok) return false;
            const buf = await res.arrayBuffer();
            if (buf.byteLength < 500) return false; // skip 1x1 placeholders
            const storagePath = `${auction_id}/${lotRow.id}/${p}.jpg`;
            const { error: upErr } = await supabase.storage
              .from('lot-photos')
              .upload(storagePath, Buffer.from(buf), { contentType: 'image/jpeg', upsert: true });
            if (upErr) return false;
            const { error: lpErr } = await supabase.from('lot_photos').insert({
              lot_id: lotRow.id,
              storage_path: storagePath,
              display_order: p,
            });
            return !lpErr;
          } catch {
            return false;
          } finally {
            clearTimeout(timer);
          }
        }),
      );
      const photos_uploaded = photoResults.filter(Boolean).length;

      results.push({
        af_item_id,
        destination_lot_number,
        success: true,
        photos_uploaded,
      });
    } catch (err: any) {
      results.push({
        af_item_id,
        destination_lot_number,
        success: false,
        photos_uploaded: 0,
        error: err?.message || String(err),
      });
    }
  }

  const created = results.filter((r) => r.success).length;
  return NextResponse.json({ created, total: af_item_ids.length, results });
}
