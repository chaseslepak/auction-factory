import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/crypto';

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

  // Extract just the PHPSESSID from the cookie string
  const phpMatch = session_cookie.match(/PHPSESSID=([^;]+)/);
  const cleanCookie = phpMatch ? `PHPSESSID=${phpMatch[1]}` : session_cookie;

  // Verify the cookie works by loading the add_item page
  try {
    const res = await fetch(`${AF_BASE}/add_item.php`, {
      headers: { Cookie: cleanCookie },
    });
    const html = await res.text();

    // Check if we get the auction selector (= logged in) vs login page
    if (html.includes('psEmail') || html.includes('psPassword')) {
      return NextResponse.json({ error: 'Invalid session cookie. Make sure you are logged into AF.' }, { status: 400 });
    }

    if (!html.includes('Choose a auction')) {
      return NextResponse.json({ error: 'Cookie connected but unexpected page. Try again.' }, { status: 400 });
    }

    // Encrypt the cookie before storing
    let toStore = cleanCookie;
    try {
      toStore = encrypt(cleanCookie);
    } catch {
      // If encryption fails (e.g. no secret configured), fall back to plaintext
    }

    await supabase
      .from('af_session')
      .upsert({ id: 1, session_cookie: toStore, updated_at: new Date().toISOString() });

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

    let cookie = full!.session_cookie;
    try {
      cookie = decrypt(cookie);
    } catch {}

    const res = await fetch(`${AF_BASE}/auctions.php`, {
      headers: { Cookie: cookie },
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
