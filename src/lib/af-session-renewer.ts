// Programmatic AF admin login.
//
// Reads AF_LOGIN_EMAIL + AF_LOGIN_PASSWORD from env, logs in to
// auctionfactory.com/admin, and returns a fresh cookie string. Called
// by /api/af-session/renew directly, or auto-invoked by the pre-flight
// check in /api/af-upload when the stored cookie has expired.
//
// Env vars are expected to live in Vercel (encrypted at rest) — never
// committed. Creds are not read from the DB and never flow to the
// client.
//
// Flow:
//   1. GET /admin/Login.php to seed an initial PHPSESSID + parse the
//      form's action URL. We parse structurally so a form rename
//      doesn't break us.
//   2. POST psEmail + psPassword to the form action with the seed
//      cookie. AF's response rotates PHPSESSID in Set-Cookie.
//   3. GET /admin/add_item.php with the new cookie, redirect: 'manual'.
//      A 200 with form markers means we're in; a 302 to AccessFail
//      means credentials were rejected.
//
// Rate-limit: callers must not invoke more than once per 10 minutes
// to avoid tripping AF account lockout. The /api/af-session/renew
// route enforces this; direct lib callers must respect it themselves.

const AF_BASE = 'https://auctionfactory.com/admin';
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export interface RenewResult {
  success: boolean;
  cookie?: string;
  error?: string;
  diagnostic?: Record<string, any>;
}

// Build a Cookie header string from a Set-Cookie list. Accepts the
// current cookie as a starting point so AF's incremental Set-Cookie
// responses layer correctly.
function mergeCookies(existing: string, setCookieList: string[]): string {
  const jar: Record<string, string> = {};
  // Parse current cookie string (Name=Value; Name=Value; ...)
  if (existing) {
    for (const pair of existing.split(';')) {
      const [k, ...v] = pair.trim().split('=');
      if (k) jar[k] = v.join('=');
    }
  }
  for (const sc of setCookieList) {
    // Set-Cookie: Name=Value; Path=/; HttpOnly ...
    const first = sc.split(';')[0];
    const [k, ...v] = first.split('=');
    if (k) jar[k.trim()] = v.join('=').trim();
  }
  return Object.entries(jar)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ');
}

// Node's fetch flattens Set-Cookie into one comma-separated string by
// default; use getSetCookie() when available (Node 20+).
function getSetCookies(res: Response): string[] {
  const anyRes = res.headers as any;
  if (typeof anyRes.getSetCookie === 'function') return anyRes.getSetCookie();
  const combined = res.headers.get('set-cookie');
  if (!combined) return [];
  // Split on comma preceded by a cookie-value char but not inside Expires=...
  // AF cookies don't use Expires with commas today, so this is safe enough.
  return combined.split(/,(?=\s*[A-Za-z0-9_\-]+=)/);
}

// Parse a <form> action URL that contains psEmail/psPassword inputs.
function findLoginFormAction(html: string): string | null {
  const formRegex = /<form\b[^>]*>([\s\S]*?)<\/form>/gi;
  let m: RegExpExecArray | null;
  while ((m = formRegex.exec(html)) !== null) {
    if (/name=["']psEmail["']/i.test(m[1]) && /name=["']psPassword["']/i.test(m[1])) {
      const open = m[0].split('>')[0];
      const act = open.match(/\baction=["']([^"']*)["']/i);
      // Empty action means "post to self" — fall back to the login URL.
      return (act ? act[1] : '') || 'Login.php';
    }
  }
  return null;
}

export async function renewAfSession(): Promise<RenewResult> {
  const email = process.env.AF_LOGIN_EMAIL;
  const password = process.env.AF_LOGIN_PASSWORD;
  if (!email || !password) {
    return {
      success: false,
      error:
        'AF_LOGIN_EMAIL / AF_LOGIN_PASSWORD not set in Vercel env — auto-renewal disabled.',
    };
  }

  // Step 1: GET the login page to seed PHPSESSID + find the form action.
  let loginPageRes;
  try {
    loginPageRes = await fetch(`${AF_BASE}/Login.php`, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html' },
      redirect: 'follow',
    });
  } catch (err: any) {
    return { success: false, error: `GET Login.php failed: ${err?.message}` };
  }
  const loginHtml = await loginPageRes.text();
  const action = findLoginFormAction(loginHtml);
  if (!action) {
    return {
      success: false,
      error: 'Could not find psEmail/psPassword form on Login.php — AF markup may have changed.',
      diagnostic: { html_sample: loginHtml.substring(0, 500) },
    };
  }
  const seedCookie = mergeCookies('', getSetCookies(loginPageRes));

  // Resolve the form action URL. AF uses relative paths like
  // "LoginAction.php" or an empty action (post-to-self).
  const actionUrl = /^https?:/i.test(action)
    ? action
    : `${AF_BASE}/${action.replace(/^\.?\//, '')}`;

  // Step 2: POST credentials.
  const body = new URLSearchParams({
    psEmail: email,
    psPassword: password,
    submit: 'Login',
    login: 'Login',
  }).toString();

  let postRes;
  try {
    postRes = await fetch(actionUrl, {
      method: 'POST',
      headers: {
        Cookie: seedCookie,
        'User-Agent': BROWSER_UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'text/html',
        Referer: `${AF_BASE}/Login.php`,
      },
      body,
      redirect: 'manual',
    });
  } catch (err: any) {
    return { success: false, error: `POST login failed: ${err?.message}` };
  }

  // AF may rotate PHPSESSID in Set-Cookie on login — merge in.
  const postCookie = mergeCookies(seedCookie, getSetCookies(postRes));

  // Step 3: verify by hitting an admin page.
  let verifyRes;
  try {
    verifyRes = await fetch(`${AF_BASE}/add_item.php`, {
      headers: { Cookie: postCookie, 'User-Agent': BROWSER_UA, Accept: 'text/html' },
      redirect: 'manual',
    });
  } catch (err: any) {
    return { success: false, error: `Verify GET failed: ${err?.message}` };
  }
  const redirectLoc = verifyRes.status >= 300 && verifyRes.status < 400
    ? verifyRes.headers.get('location')
    : null;
  if (redirectLoc && /AccessFail|Login/i.test(redirectLoc)) {
    return {
      success: false,
      error: 'Login POST did not establish a session — credentials rejected.',
      diagnostic: { verify_status: verifyRes.status, verify_redirect: redirectLoc },
    };
  }

  // If AF 302'd us somewhere non-login, follow one hop so we can check markers.
  let verifyHtml = '';
  if (redirectLoc) {
    const hop = await fetch(new URL(redirectLoc, `${AF_BASE}/`).toString(), {
      headers: { Cookie: postCookie, 'User-Agent': BROWSER_UA },
      redirect: 'manual',
    });
    verifyHtml = await hop.text();
  } else {
    verifyHtml = await verifyRes.text();
  }

  const loggedIn =
    !/name=["']psEmail["']|name=["']psPassword["']/i.test(verifyHtml) &&
    /name=["']auction["']|name=["']title["']|name=["']original_price["']|logout/i.test(verifyHtml);
  if (!loggedIn) {
    return {
      success: false,
      error: "Logged-in markers not found on verify response — AF may have added a CAPTCHA or MFA.",
      diagnostic: { verify_status: verifyRes.status, html_sample: verifyHtml.substring(0, 500) },
    };
  }

  return { success: true, cookie: postCookie };
}
