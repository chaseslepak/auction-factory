import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Deterministic "user photos first, stock photos last" normalization.
// Walks every lot (either in a given auction, or across the whole DB
// if auction_id is omitted) and rewrites display_order so all
// non-stock photos get indices 0..N-1 and stock photos get N..end.
// No AI, no probabilistic classifiers — purely based on storage_path
// containing '/stock_'.
//
// This is the 100% certain backstop: AF's primary photo is ALWAYS a
// user warehouse photo (if one exists), so a placeholder stock image
// can never cause an AF rejection.
//
// POST /api/admin/reorder-photos-user-first
//   body: { auction_id?: string }
//
// Idempotent — running twice does nothing.
export async function POST(request: NextRequest) {
  const userClient = createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { auction_id } = await request.json().catch(() => ({}));
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = serviceKey
    ? createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    : userClient;

  let lotsQuery = supabase
    .from('lots')
    .select('id, lot_photos(id, storage_path, display_order)')
    .is('deleted_at', null);
  if (auction_id) lotsQuery = lotsQuery.eq('auction_id', auction_id);

  const { data: lots, error } = await lotsQuery.limit(50000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let lotsScanned = 0;
  let lotsReordered = 0;
  let photosMoved = 0;

  for (const lot of lots || []) {
    lotsScanned++;
    const photos = (lot as any).lot_photos || [];
    if (photos.length < 2) continue;

    // Sort: non-stock first (keeping their original relative order),
    // then stock photos (keeping their original relative order).
    const sorted = [...photos].sort((a: any, b: any) => {
      const aStock = a.storage_path?.includes('/stock_') ? 1 : 0;
      const bStock = b.storage_path?.includes('/stock_') ? 1 : 0;
      if (aStock !== bStock) return aStock - bStock;
      return (a.display_order ?? 0) - (b.display_order ?? 0);
    });

    // Compute new display_order; only write when it differs from current.
    const changes: Array<{ id: string; new_order: number }> = [];
    for (let i = 0; i < sorted.length; i++) {
      if ((sorted[i].display_order ?? 0) !== i) {
        changes.push({ id: sorted[i].id, new_order: i });
      }
    }

    if (changes.length > 0) {
      lotsReordered++;
      photosMoved += changes.length;
      // Two-phase shuffle to avoid unique-constraint races: shift
      // everything into a high range first, then settle to final values.
      for (const c of changes) {
        await supabase
          .from('lot_photos')
          .update({ display_order: 10000 + c.new_order })
          .eq('id', c.id);
      }
      for (const c of changes) {
        await supabase
          .from('lot_photos')
          .update({ display_order: c.new_order })
          .eq('id', c.id);
      }
    }
  }

  return NextResponse.json({
    scope: auction_id ? `auction ${auction_id}` : 'all auctions',
    lots_scanned: lotsScanned,
    lots_reordered: lotsReordered,
    photos_moved: photosMoved,
  });
}
