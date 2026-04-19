import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { lot_id, photo_ids } = await request.json();
  if (!lot_id || !Array.isArray(photo_ids)) {
    return NextResponse.json({ error: 'lot_id and photo_ids array required' }, { status: 400 });
  }

  // Update display_order for each photo in parallel, then check for errors
  const results = await Promise.all(
    photo_ids.map((id: string, i: number) =>
      supabase
        .from('lot_photos')
        .update({ display_order: i })
        .eq('id', id)
        .eq('lot_id', lot_id)
    )
  );
  const firstError = results.find((r) => r.error);
  if (firstError?.error) {
    return NextResponse.json({ error: firstError.error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
