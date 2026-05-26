import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

// List all listings.
export async function GET() {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listings: data || [] });
}

// Upsert a listing keyed by handle (used when photos are uploaded / drafts generated).
export async function POST(request: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  if (!body.handle) {
    return NextResponse.json({ error: 'handle is required' }, { status: 400 });
  }

  const row: Record<string, any> = { handle: body.handle, updated_at: new Date().toISOString() };
  for (const k of [
    'product_id', 'product_type', 'title', 'price', 'category',
    'condition', 'description', 'keywords', 'photo_paths', 'match_warning', 'status',
  ]) {
    if (k in body) row[k] = body[k];
  }

  const { data, error } = await supabase
    .from('marketplace_listings')
    .upsert(row, { onConflict: 'handle' })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listing: data });
}

// Update fields / status by id.
export async function PATCH(request: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const updates: Record<string, any> = { updated_at: new Date().toISOString() };
  for (const k of ['title', 'price', 'category', 'condition', 'description', 'keywords', 'status']) {
    if (k in body) updates[k] = body[k];
  }
  if (body.status === 'posted') updates.posted_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('marketplace_listings')
    .update(updates)
    .eq('id', body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ listing: data });
}

// Delete by id.
export async function DELETE(request: NextRequest) {
  const { supabase, user } = await requireUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await supabase.from('marketplace_listings').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
