import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import crypto from 'crypto';

// Generate a time-limited token for an auction that the browser upload
// script can use to fetch lot data without needing cookie auth.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { auction_id } = await request.json();
  if (!auction_id) {
    return NextResponse.json({ error: 'auction_id required' }, { status: 400 });
  }

  // Clean up expired tokens
  await supabase
    .from('upload_tokens')
    .delete()
    .lt('expires_at', new Date().toISOString());

  // Generate a random token
  const token = crypto.randomBytes(32).toString('hex');

  const { error } = await supabase.from('upload_tokens').insert({
    token,
    auction_id,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ token });
}
