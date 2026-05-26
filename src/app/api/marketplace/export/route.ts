import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const maxDuration = 60;

// The Chrome extension calls this with a token. Token-guarded, so it reads via
// the service-role key (bypassing RLS). Public path — see middleware.ts.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function getToken(request: NextRequest): string | null {
  const auth = request.headers.get('authorization') || '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return new URL(request.url).searchParams.get('token');
}

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createServiceClient(url, key);
}

async function validateToken(supabase: any, token: string | null): Promise<boolean> {
  if (!token) return false;
  const { data } = await supabase
    .from('marketplace_tokens')
    .select('token, expires_at')
    .eq('token', token)
    .maybeSingle();
  if (!data) return false;
  return new Date(data.expires_at).getTime() > Date.now();
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// List approved listings with resolved photo URLs.
export async function GET(request: NextRequest) {
  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500, headers: CORS_HEADERS });
  }
  if (!(await validateToken(supabase, getToken(request)))) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: CORS_HEADERS });
  }

  const { data, error } = await supabase
    .from('marketplace_listings')
    .select('*')
    .eq('status', 'approved')
    .order('updated_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }

  const listings = (data || []).map((l: any) => ({
    id: l.id,
    handle: l.handle,
    title: l.title,
    price: l.price,
    category: l.category,
    condition: l.condition,
    description: l.description,
    keywords: l.keywords || [],
    photos: (l.photo_paths || []).map(
      (p: string) => supabase.storage.from('marketplace-photos').getPublicUrl(p).data.publicUrl
    ),
  }));

  return NextResponse.json({ listings }, { headers: CORS_HEADERS });
}

// Mark a listing as posted (called after the user clicks Publish in Facebook).
export async function POST(request: NextRequest) {
  const supabase = serviceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500, headers: CORS_HEADERS });
  }
  const token = getToken(request);
  if (!(await validateToken(supabase, token))) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401, headers: CORS_HEADERS });
  }

  const body = await request.json().catch(() => ({}));
  if (!body.id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400, headers: CORS_HEADERS });
  }

  const { error } = await supabase
    .from('marketplace_listings')
    .update({ status: 'posted', posted_at: new Date().toISOString() })
    .eq('id', body.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
  return NextResponse.json({ ok: true }, { headers: CORS_HEADERS });
}
