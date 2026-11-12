import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { fetchLotFullDetailAuthed, fetchAuctionLots, ScrapedLot } from '@/lib/af-archive';

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
  // Server-side cap so one call stays inside the Vercel function
  // timeout even at ~1s/photo on a lot with 10 images.
  if (af_item_ids.length > 10) {
    return NextResponse.json(
      { error: 'Max 10 lots per import batch — split into multiple calls.' },
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
      const detail = await fetchLotFullDetailAuthed(af_item_id, cookie);
      const archiveLot = archiveIndex?.get(af_item_id) ?? null;

      // Fall back to archive-page fields when the authed detail scrape
      // comes back empty (e.g. session expired). We still get an
      // importable lot, just with one photo and lighter metadata.
      const item_name = detail?.item_name || archiveLot?.item_name || `Imported lot ${af_item_id}`;
      const brand = detail?.brand || archiveLot?.brand || '';
      const model = detail?.model || archiveLot?.model || '';
      const retail = detail?.retail_new ?? archiveLot?.retail_new ?? null;
      const description = detail?.description || '';
      // Condition rating from authed detail (parsed int); otherwise
      // parse the archive page's "N - Label" string; otherwise null.
      let condition_rating: number | null = detail?.condition_rating ?? null;
      if (condition_rating == null && archiveLot?.condition_rating) {
        const m = String(archiveLot.condition_rating).match(/(\d{1,2})/);
        if (m) {
          const n = Number(m[1]);
          if (n >= 1 && n <= 10) condition_rating = n;
        }
      }
      const width = detail?.width || null;
      const depth = detail?.depth || null;
      const height = detail?.height || null;

      // Photo URL list: prefer the authed detail scrape (full set);
      // fall back to the archive thumbnail if the detail page gave
      // nothing.
      const image_urls = detail?.image_urls?.length
        ? detail.image_urls
        : archiveLot?.image_url ? [archiveLot.image_url] : [];

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
          listed_price: 0,
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

      // Download each photo and attach as a lot_photos row. First one
      // becomes display_order=0 (primary), rest append.
      let photos_uploaded = 0;
      for (let p = 0; p < image_urls.length; p++) {
        const url = image_urls[p];
        try {
          const res = await fetch(url, {
            headers: { 'User-Agent': UA, Cookie: cookie },
          });
          if (!res.ok) continue;
          const buf = await res.arrayBuffer();
          if (buf.byteLength < 500) continue; // skip 1x1 placeholders
          const storagePath = `${auction_id}/${lotRow.id}/${p}.jpg`;
          const { error: upErr } = await supabase.storage
            .from('lot-photos')
            .upload(storagePath, Buffer.from(buf), { contentType: 'image/jpeg', upsert: true });
          if (upErr) continue;
          const { error: lpErr } = await supabase.from('lot_photos').insert({
            lot_id: lotRow.id,
            storage_path: storagePath,
            display_order: p,
          });
          if (!lpErr) photos_uploaded++;
        } catch {
          // Single-photo failure is non-fatal; try the rest.
        }
      }

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
