import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

// DELETE a specific photo from a lot
export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { photo_id } = await request.json();
  if (!photo_id) {
    return NextResponse.json({ error: 'photo_id required' }, { status: 400 });
  }

  // Get the photo to find storage path
  const { data: photo } = await supabase
    .from('lot_photos')
    .select('*')
    .eq('id', photo_id)
    .single();

  if (!photo) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
  }

  // Delete from storage
  await supabase.storage.from('lot-photos').remove([photo.storage_path]);

  // Delete the photo record
  await supabase.from('lot_photos').delete().eq('id', photo_id);

  return NextResponse.json({ success: true });
}

// POST to reorder photos for a lot
export async function POST(request: NextRequest) {
  // Auth via the user-scoped client so only logged-in users can hit this.
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { lot_id, photo_ids } = await request.json();
  if (!lot_id || !Array.isArray(photo_ids)) {
    return NextResponse.json({ error: 'lot_id and photo_ids array required' }, { status: 400 });
  }

  // Actual writes go through the service-role client. The lot_photos
  // table has no UPDATE RLS policy (see supabase/phase12_lot_photos_update.sql),
  // so user-scoped .update() gets silently dropped (0 rows affected,
  // no error) and reordering never persists. Using service role bypasses
  // RLS so the reorder works today regardless of whether the migration
  // has been run.
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'Service role key not configured' },
      { status: 500 }
    );
  }
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  );

  // Update display_order for each photo. Sequential (not Promise.all)
  // so we can surface a per-row error if a specific update fails and
  // to keep query concurrency low for this small operation. Include
  // .select() so we can verify the row actually matched — if a
  // provided photo_id doesn't belong to lot_id, `data` comes back
  // empty and we know the client sent stale IDs.
  const failures: { id: string; reason: string }[] = [];
  for (let i = 0; i < photo_ids.length; i++) {
    const id = photo_ids[i];
    const { data, error } = await supabase
      .from('lot_photos')
      .update({ display_order: i })
      .eq('id', id)
      .eq('lot_id', lot_id)
      .select('id');
    if (error) {
      failures.push({ id, reason: error.message });
    } else if (!data || data.length === 0) {
      failures.push({ id, reason: 'no matching row (wrong lot_id?)' });
    }
  }

  if (failures.length > 0) {
    return NextResponse.json(
      {
        error: `Reorder partial fail: ${failures
          .map((f) => `${f.id.slice(0, 8)} (${f.reason})`)
          .join('; ')}`,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
