import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import {
  recordRejectedStockImage,
  revertLotToUserPhotos,
} from '@/lib/stock-image-processor';

export const maxDuration = 30;

// POST /api/stock-image/revert
// Body: { lot_id: string, record_rejection?: boolean }
//
// "Use my photos" button — unconditionally drop any stock image(s) on
// the lot and promote the user's own photos back to primary. By default
// also records the removed source URL as rejected so a future retry on
// a sibling lot (same brand+model) won't resurface it. Pass
// record_rejection:false to just revert without blocking the URL
// (handy if the stock image was fine but Chase wants to feature a
// specific user photo for some other reason).
export async function POST(request: NextRequest) {
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const lotId = String(body?.lot_id || '').trim();
  if (!lotId) return NextResponse.json({ error: 'lot_id required' }, { status: 400 });
  const recordRejection = body?.record_rejection !== false;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  );

  const { data: lot, error: lotErr } = await supabase
    .from('lots')
    .select('id, brand, model, lot_photos(*)')
    .eq('id', lotId)
    .single();
  if (lotErr || !lot) {
    return NextResponse.json(
      { error: lotErr?.message || 'Lot not found' },
      { status: 404 }
    );
  }

  const brand = (lot.brand || '').trim();
  const model = (lot.model || '').trim();
  const stockPhoto = ((lot as any).lot_photos || []).find((p: any) =>
    (p.storage_path || '').includes('/stock_')
  );

  if (recordRejection && stockPhoto?.source_url && brand && model) {
    await recordRejectedStockImage(supabase, {
      brand,
      model,
      image_url: stockPhoto.source_url,
      rejected_by: user.email || undefined,
      reason: 'user clicked revert-to-my-photos on review page',
    });
  }

  const stats = await revertLotToUserPhotos(supabase, lotId);

  const { data: fresh } = await supabase
    .from('lots')
    .select('id, lot_photos(*)')
    .eq('id', lotId)
    .single();

  return NextResponse.json({
    success: true,
    removed_count: stats.removed,
    kept_count: stats.kept,
    rejected_source_url: recordRejection ? stockPhoto?.source_url ?? null : null,
    photos: (fresh as any)?.lot_photos ?? [],
  });
}
