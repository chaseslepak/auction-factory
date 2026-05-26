import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';

// Mint a token the Chrome extension uses to pull approved listings.
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let label = 'extension';
  try {
    const body = await request.json();
    if (body?.label) label = String(body.label).slice(0, 60);
  } catch {}

  const token = randomBytes(24).toString('hex');
  const { error } = await supabase
    .from('marketplace_tokens')
    .insert({ token, label });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ token });
}
