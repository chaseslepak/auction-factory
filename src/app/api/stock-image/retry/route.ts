import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import {
  processStockImageJob,
  recordRejectedStockImage,
  revertLotToUserPhotos,
} from '@/lib/stock-image-processor';

export const maxDuration = 60;

// POST /api/stock-image/retry
// Body: { lot_id: string }
//
// Flow for "Wrong image — try another":
//   1. Look up the current stock photo on this lot.
//   2. Mark its source_url as rejected for (brand, model) so no future
//      search for this brand+model ever picks it again.
//   3. Delete the current stock photo and resequence the user's own
//      photos to primary (lot photos stay a valid state throughout).
//   4. Run processStockImageJob again — the rejected URL is now in the
//      exclude set, so a different candidate wins (or the vision
//      confidence gate decides nothing is good enough).
//   5. Return the new state so the UI can refresh.
export async function POST(request: NextRequest) {
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const lotId = String(body?.lot_id || '').trim();
  if (!lotId) return NextResponse.json({ error: 'lot_id required' }, { status: 400 });

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  );

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
  }
  const anthropic = new Anthropic({ apiKey });

  // Use `lot_photos(*)` so this still works if phase14 hasn't been run —
  // the explicit `source_url` column reference would make this SELECT
  // fail with "column does not exist" and surface as "Retry failed: Lot
  // not found" to the user.
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

  // Find the current stock photo (if any) and record its source URL as
  // rejected before we strip it. Doing this BEFORE delete so a crash
  // mid-run can't lose the signal.
  const stockPhoto = ((lot as any).lot_photos || []).find((p: any) =>
    (p.storage_path || '').includes('/stock_')
  );
  if (stockPhoto?.source_url && brand && model) {
    await recordRejectedStockImage(supabase, {
      brand,
      model,
      image_url: stockPhoto.source_url,
      rejected_by: user.email || undefined,
      reason: 'user clicked retry on review page',
    });
  }

  // Strip the current stock image + resequence user photos.
  await revertLotToUserPhotos(supabase, lotId);

  // Re-run the search. Rejected URLs are now filtered inside
  // findAndVerifyStockImageCore via rejected_stock_images.
  const result = await processStockImageJob(supabase, anthropic, lotId);

  // Pull the lot's photos again so the client renders the new state.
  const { data: fresh } = await supabase
    .from('lots')
    .select('id, lot_photos(*)')
    .eq('id', lotId)
    .single();

  return NextResponse.json({
    success: result.success,
    found: result.found,
    diag: result.diag,
    rejected_source_url: stockPhoto?.source_url ?? null,
    photos: (fresh as any)?.lot_photos ?? [],
  });
}
