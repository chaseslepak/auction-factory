import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/crypto';

const AF_BASE = 'https://auctionfactory.com/admin';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Normalize whatever the user pasted into a `Name=Value; Name=Value; ...`
// Cookie-header string. Accepts:
//   - A full document.cookie value with lots of pairs — passed through
//     so any auth cookies AF added alongside PHPSESSID also go along.
//   - A `PHPSESSID=hash` snippet — passed through as-is.
//   - A bare hash — wrapped as PHPSESSID=<hash>.
//   - Anything else — passed through so a format change still works.
function normalizeCookie(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed) return '';
  // Bare hash → add PHPSESSID prefix.
  if (/^[a-z0-9]{20,80}$/i.test(trimmed) && !trimmed.includes('=')) {
    return `PHPSESSID=${trimmed}`;
  }
  return trimmed;
}

// Returns 'logged_in' | 'login_page' | 'unknown_page'. The admin now 302s
// unauthenticated requests to AccessFail.php (which then shows the login
// form); logged-in requests return the admin UI directly. Use
// `redirect: 'manual'` so a 302 → login is distinguishable from a 200
// with real content.
async function checkSession(cookie: string): Promise<{
  state: 'logged_in' | 'login_page' | 'unknown_page';
  http_status: number;
  redirect_url: string | null;
  body_sample: string;
}> {
  const res = await fetch(`${AF_BASE}/add_item.php`, {
    headers: {
      Cookie: cookie,
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    redirect: 'manual',
  });

  const redirectUrl = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null;

  // Any redirect at this layer means AF is bouncing us to a different page.
  // AccessFail.php, LoginAction.php, Login.php, or anything explicitly "login"
  // is a clear "not logged in" signal.
  if (redirectUrl && /AccessFail|login|Login/i.test(redirectUrl)) {
    return { state: 'login_page', http_status: res.status, redirect_url: redirectUrl, body_sample: '' };
  }

  // Non-login redirect (e.g. to a different admin page) — probably fine,
  // but let's chase one hop to see what we land on.
  const finalRes = redirectUrl
    ? await fetch(new URL(redirectUrl, AF_BASE + '/').toString(), {
        headers: {
          Cookie: cookie,
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        redirect: 'manual',
      })
    : res;

  const html = await finalRes.text();
  const body_sample = html.substring(0, 500);

  // Login page markers (name attributes are structural, not label text).
  if (/name=["']psEmail["']|name=["']psPassword["']|Admin\s+Login/i.test(html)) {
    return { state: 'login_page', http_status: finalRes.status, redirect_url: redirectUrl, body_sample };
  }

  // Logged-in markers: any of the admin form fields the lotter needs.
  // Also match generic admin signals so a UI reshuffle doesn't trip us.
  const loggedInMarkers = [
    /name=["']auction["']/i,
    /name=["']title["']/i,
    /name=["']original_price["']/i,
    /add_item_2new/i,
    /<select[^>]*name=["'][^"']*auction/i,
    /logout/i,
    /sign\s*out/i,
  ];
  if (loggedInMarkers.some((rx) => rx.test(html))) {
    return { state: 'logged_in', http_status: finalRes.status, redirect_url: redirectUrl, body_sample };
  }

  return { state: 'unknown_page', http_status: finalRes.status, redirect_url: redirectUrl, body_sample };
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { session_cookie } = await request.json();
  if (!session_cookie) {
    return NextResponse.json({ error: 'session_cookie required' }, { status: 400 });
  }

  const cleanCookie = normalizeCookie(session_cookie);
  if (!cleanCookie) {
    return NextResponse.json({ error: 'Empty cookie after normalization.' }, { status: 400 });
  }

  try {
    // First try with the full cookie string (preserves CSRF / auth cookies
    // AF may have added alongside PHPSESSID).
    let check = await checkSession(cleanCookie);

    // If that failed AND the user pasted multiple cookies, fall back to just
    // the PHPSESSID in case extra cookies are confusing AF.
    if (check.state !== 'logged_in' && cleanCookie.includes(';')) {
      const phpMatch = cleanCookie.match(/PHPSESSID=[^;]+/i);
      if (phpMatch) {
        const retry = await checkSession(phpMatch[0]);
        if (retry.state === 'logged_in') {
          check = retry;
        }
      }
    }

    if (check.state === 'login_page') {
      return NextResponse.json(
        {
          error:
            'That cookie put us on the login page. Make sure you are logged in at auctionfactory.com/admin (no www), then copy the cookie again.',
          diagnostic: {
            http_status: check.http_status,
            redirect_url: check.redirect_url,
          },
        },
        { status: 400 }
      );
    }
    if (check.state === 'unknown_page') {
      return NextResponse.json(
        {
          error:
            "The cookie worked but we didn't recognize the admin page. AF may have redesigned the admin again — paste this response to Chase.",
          diagnostic: {
            http_status: check.http_status,
            redirect_url: check.redirect_url,
            body_sample: check.body_sample,
          },
        },
        { status: 400 }
      );
    }

    // Logged in — persist (encrypted if possible).
    let toStore = cleanCookie;
    try {
      toStore = encrypt(cleanCookie);
    } catch {}

    await supabase.from('af_session').upsert({
      id: 1,
      session_cookie: toStore,
      updated_at: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: session } = await supabase
    .from('af_session')
    .select('session_cookie, updated_at')
    .eq('id', 1)
    .single();

  if (!session) {
    return NextResponse.json({ connected: false });
  }

  try {
    let cookie = session.session_cookie;
    try {
      cookie = decrypt(cookie);
    } catch {}

    const check = await checkSession(cookie);
    return NextResponse.json({
      connected: check.state === 'logged_in',
      state: check.state,
      updated_at: session.updated_at,
    });
  } catch {
    return NextResponse.json({ connected: false, updated_at: session.updated_at });
  }
}
