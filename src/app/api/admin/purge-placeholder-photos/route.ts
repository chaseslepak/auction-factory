import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { classifyImageAsPlaceholder } from '@/lib/stock-image-processor';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Walk every photo for an auction, vision-check each one, and delete
// any that look like a vendor "IMAGE COMING SOON" / placeholder graphic.
// The source of the previous Mega CLE push failure.
//
// POST /api/admin/purge-placeholder-photos
//   body: { auction_id: string, dry_run?: boolean }
//
// Returns per-photo results: kept vs flagged (with the lot_number so
// Chase can eyeball before confirming). Dry-run leaves everything in
// place; set dry_run=false to actually delete.
export async function POST(request: NextRequest) {
  const userClient = createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { auction_id, dry_run } = await request.json();
  if (!auction_id) {
    return NextResponse.json({ error: 'auction_id required' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'ANTHROPIC_API_KEY not set' }, { status: 500 });
  const anthropic = new Anthropic({ apiKey });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = serviceKey
    ? createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    : userClient;

  // Pull every photo attached to any lot in this auction. We scan all
  // of them, not just /stock_, because manual uploads can also be
  // placeholder-ish (Chase has seen cases).
  const { data: lots } = await supabase
    .from('lots')
    .select('id, lot_number, item_name, lot_photos(id, storage_path, display_order, source_type)')
    .eq('auction_id', auction_id)
    .is('deleted_at', null);

  if (!lots || lots.length === 0) {
    return NextResponse.json({ error: 'No lots in that auction' }, { status: 404 });
  }

  const flagged: Array<{
    lot_id: string;
    lot_number: number | null;
    item_name: string | null;
    photo_id: string;
    storage_path: string;
    deleted: boolean;
  }> = [];
  let scanned = 0;
  let kept = 0;

  for (const lot of lots as any[]) {
    const photos = (lot.lot_photos || []).sort(
      (a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0),
    );
    for (const photo of photos) {
      scanned++;
      try {
        const { data: file } = await supabase.storage
          .from('lot-photos')
          .download(photo.storage_path);
        if (!file) {
          kept++;
          continue;
        }
        const buf = Buffer.from(await file.arrayBuffer());
        if (buf.length === 0) {
          // Zero-byte file is also useless to AF — treat as placeholder.
          flagged.push({
            lot_id: lot.id,
            lot_number: lot.lot_number,
            item_name: lot.item_name,
            photo_id: photo.id,
            storage_path: photo.storage_path,
            deleted: false,
          });
          continue;
        }
        const isPlaceholder = await classifyImageAsPlaceholder(
          anthropic,
          buf.toString('base64'),
        );
        if (isPlaceholder) {
          flagged.push({
            lot_id: lot.id,
            lot_number: lot.lot_number,
            item_name: lot.item_name,
            photo_id: photo.id,
            storage_path: photo.storage_path,
            deleted: false,
          });
        } else {
          kept++;
        }
      } catch {
        kept++;
      }
    }
  }

  if (!dry_run && flagged.length > 0) {
    for (const f of flagged) {
      try {
        await supabase.storage.from('lot-photos').remove([f.storage_path]);
        await supabase.from('lot_photos').delete().eq('id', f.photo_id);
        f.deleted = true;
      } catch {}
    }
    // Normalize display_order on affected lots so the remaining photos
    // start at 0 and have no gaps.
    const affectedLotIds = Array.from(new Set(flagged.map((f) => f.lot_id)));
    for (const lotId of affectedLotIds) {
      const { data: remaining } = await supabase
        .from('lot_photos')
        .select('id, display_order')
        .eq('lot_id', lotId)
        .order('display_order', { ascending: true });
      if (remaining) {
        for (let i = 0; i < remaining.length; i++) {
          if (remaining[i].display_order !== i) {
            await supabase
              .from('lot_photos')
              .update({ display_order: i })
              .eq('id', remaining[i].id);
          }
        }
      }
    }
  }

  return NextResponse.json({
    dry_run: !!dry_run,
    scanned,
    kept,
    flagged_count: flagged.length,
    flagged,
  });
}
