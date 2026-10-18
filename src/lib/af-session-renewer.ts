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

// Module-level rate-limit guard — fast-path short-circuit so we don't
// burn a DB round-trip when the same Vercel invocation already renewed.
// NOT the authoritative check: each Vercel invocation has its own module
// state, so parallel invocations would each pass this check. The
// authoritative DB CAS below prevents the real risk of parallel
// renewAfSession() calls → N parallel logins → AF account lockout.
const LIB_MIN_INTERVAL_MS = 10 * 60 * 1000;
let lastRenewAttemptMs = 0;

// DB-level CAS rate limit — moved from /api/af-session/renew/route.ts
// so ALL callers (route, mid-batch auto-renew, pre-flight renew, cron
// recovery) go through the same gate. Returns true if THIS caller
// claimed the slot (safe to proceed), false if someone else already
// did within the window.
async function tryClaimRenewalSlot(): Promise<{ ok: boolean; waitSec?: number; reason?: string }> {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceKey || !url) {
    // Can't CAS without service role. Module-level guard remains the
    // fallback; parallel-invocation risk is accepted here.
    return { ok: true };
  }
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(url, serviceKey);
    const { data: existing } = await supabase
      .from('af_session')
      .select('last_renewed_at')
      .eq('id', 1)
      .maybeSingle();
    const lastRenewalIso = (existing as any)?.last_renewed_at || null;
    if (lastRenewalIso) {
      const age = Date.now() - new Date(lastRenewalIso).getTime();
      if (age < LIB_MIN_INTERVAL_MS) {
        return {
          ok: false,
          waitSec: Math.ceil((LIB_MIN_INTERVAL_MS - age) / 1000),
          reason: `DB rate limit: last renewal was ${Math.round(age / 1000)}s ago`,
        };
      }
    }
    // Claim the slot by writing last_renewed_at=now BEFORE we hit AF.
    // If two invocations race here, both writes land but AF only sees
    // one login's worth of request time apart (<1s): the second's
    // claim-write may lose the race but its login attempt still fires.
    // That's acceptable because the chance of two Vercel invocations
    // threading this needle at the same microsecond is very low; the
    // module-level guard catches the common case.
    const nowIso = new Date().toISOString();
    const upd = await supabase
      .from('af_session')
      .upsert({ id: 1, last_renewed_at: nowIso }, { onConflict: 'id' });
    if (upd.error && /last_renewed_at/.test(upd.error.message || '')) {
      // Column doesn't exist (shouldn't happen in prod, but tolerate it).
      return { ok: true };
    }
    return { ok: true };
  } catch (err) {
    // Any DB error — don't block the renewal. Module-level guard
    // handles the per-process rate limit as a fallback.
    console.warn('tryClaimRenewalSlot failed, allowing renewal:', err);
    return { ok: true };
  }
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

  // Fast-path module guard — short-circuit on same-process retries.
  const sinceLast = Date.now() - lastRenewAttemptMs;
  if (sinceLast < LIB_MIN_INTERVAL_MS) {
    const waitSec = Math.ceil((LIB_MIN_INTERVAL_MS - sinceLast) / 1000);
    return {
      success: false,
      error: `Lib rate limit: last renew attempt was ${Math.round(sinceLast / 1000)}s ago. Wait ${waitSec}s.`,
    };
  }
  // DB CAS — authoritative check across Vercel invocations. The real
  // AF-account-lockout risk is parallel invocations racing to log in.
  const claim = await tryClaimRenewalSlot();
  if (!claim.ok) {
    return {
      success: false,
      error: `${claim.reason}. Wait ${claim.waitSec ?? '?'}s.`,
    };
  }
  lastRenewAttemptMs = Date.now();

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
