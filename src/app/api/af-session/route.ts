import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const AF_BASE = 'https://www.auctionfactory.com/admin';

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { session_cookie } = await request.json();

  if (!session_cookie) {
    return NextResponse.json({ error: 'session_cookie required' }, { status: 400 });
  }

  // Verify the cookie works by checking if we can access the admin
  try {
    const res = await fetch(`${AF_BASE}/auctions.php`, {
      headers: { Cookie: session_cookie },
      redirect: 'manual',
    });

    // 302 = redirect to login = invalid session
    if (res.status === 302) {
      return NextResponse.json({ error: 'Invalid session cookie. Make sure you are logged into AF.' }, { status: 400 });
    }

    // Store the cookie
    await supabase
      .from('af_session')
      .upsert({ id: 1, session_cookie, updated_at: new Date().toISOString() });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: session } = await supabase
    .from('af_session')
    .select('updated_at')
    .eq('id', 1)
    .single();

  if (!session) {
    return NextResponse.json({ connected: false });
  }

  // Check if session is still valid
  try {
    const { data: full } = await supabase
      .from('af_session')
      .select('session_cookie')
      .eq('id', 1)
      .single();

    const res = await fetch(`${AF_BASE}/auctions.php`, {
      headers: { Cookie: full!.session_cookie },
      redirect: 'manual',
    });

    return NextResponse.json({
      connected: res.status !== 302,
      updated_at: session.updated_at,
    });
  } catch {
    return NextResponse.json({ connected: false, updated_at: session.updated_at });
  }
}
