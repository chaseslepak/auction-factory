// Extracted from /api/af-upload/route.ts so both the per-batch client-driven
// endpoint AND the new server-run background endpoint can call it.
//
// This module does the actual POST-to-AF work for one lot. It has no
// route/auth concerns — pass in a decrypted AF session cookie and a lot
// row (with photos joined) and it returns success/failure.

// AF's photo validator rejects anything smaller than ~400px or
// non-standard formats. Normalize every image before sending: upscale
// to this minimum dimension if smaller, re-encode as JPEG at reasonable
// quality. Lets Chase keep stock images as primary while making them
// AF-acceptable even when the vendor served a 150px thumbnail.
const AF_MIN_DIMENSION = 500;
const AF_JPEG_QUALITY = 88;

async function normalizeImageForAF(buf: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import('sharp')).default;
    const img = sharp(buf, { failOn: 'none' });
    const meta = await img.metadata();
    const width = meta.width || 0;
    const height = meta.height || 0;
    const needsUpscale =
      width > 0 && height > 0 && (width < AF_MIN_DIMENSION || height < AF_MIN_DIMENSION);
    let pipeline = img.rotate(); // honor EXIF orientation
    if (needsUpscale) {
      // Preserve aspect ratio; the shorter side becomes AF_MIN_DIMENSION.
      pipeline = pipeline.resize({
        width: width <= height ? AF_MIN_DIMENSION : undefined,
        height: height < width ? AF_MIN_DIMENSION : undefined,
        fit: 'inside',
        withoutEnlargement: false,
        kernel: 'lanczos3',
      });
    }
    return await pipeline.jpeg({ quality: AF_JPEG_QUALITY, mozjpeg: true }).toBuffer();
  } catch {
    // Sharp failed (unsupported format, corrupt, etc.). Return original;
    // AF will reject if it's bad, but we don't want to drop a valid
    // photo over a Sharp quirk.
    return buf;
  }
}

// Condition rating map: our 1-10 to AF's actual dropdown values
const CONDITION_MAP: Record<number, string> = {
  10: '10 - New in box',
  9: '9 - Like New',
  8: '8 - Excellent',
  7: '7 - Good',
  6: '6 - Average',
  5: '5 - Well used',
  4: '4 - Functions',
  3: '3 - Needs parts',
  2: '2 - Repairable',
  1: '1 - Broken',
};

const AF_BASE = 'https://auctionfactory.com/admin';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Sanitize text content to avoid mod_security blocks on AF's Apache.
export function sanitizeForAF(text: string, maxLength?: number): string {
  if (!text) return '';
  let result = text
    .replace(/<[^>]*>/g, '')
    .replace(/\bunion\s+select\b/gi, 'union-select')
    .replace(/\bselect\s+\*\s+from\b/gi, 'select-from')
    .replace(/<script/gi, '[script]')
    .replace(/javascript:/gi, 'js-')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/[•▪●⁃]/g, '•')
    .trim();

  if (maxLength && result.length > maxLength) {
    result = result.substring(0, maxLength - 3) + '...';
  }
  return result;
}

async function fetchWithCookie(url: string, cookie: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...(options.headers as Record<string, string>),
      Cookie: cookie,
    },
    redirect: 'manual',
  });
}

// Merge a `Set-Cookie` response header value into the current cookie
// string. AF now rotates PHPSESSID on each form POST (CSRF rotation
// pattern), so if we don't carry forward the new value, every lot after
// the first succeeds — until AF's expiry grace runs out and the
// stale cookie starts bouncing to the login page mid-batch.
//
// Returns the updated cookie string. If no Set-Cookie was sent, returns
// the original unchanged.
export function mergeSetCookie(current: string, res: Response): string {
  // fetch's Headers.get('set-cookie') collapses multiple cookies into
  // one comma-joined string — can't safely split on ','. Use raw()
  // when available (undici) or getSetCookie() (new standard).
  const anyHeaders = res.headers as any;
  let setCookies: string[] = [];
  if (typeof anyHeaders.getSetCookie === 'function') {
    setCookies = anyHeaders.getSetCookie() || [];
  } else if (anyHeaders.raw && typeof anyHeaders.raw === 'function') {
    const raw = anyHeaders.raw();
    if (raw && raw['set-cookie']) setCookies = raw['set-cookie'];
  } else {
    const sc = res.headers.get('set-cookie');
    if (sc) setCookies = [sc];
  }

  if (setCookies.length === 0) return current;

  // Parse the current cookie string into a map of name → value.
  const jar = new Map<string, string>();
  for (const kv of (current || '').split(/;\s*/)) {
    const eq = kv.indexOf('=');
    if (eq <= 0) continue;
    jar.set(kv.slice(0, eq).trim(), kv.slice(eq + 1).trim());
  }

  // Fold in each Set-Cookie's name=value (ignore attributes).
  for (const sc of setCookies) {
    const first = sc.split(';', 1)[0];
    const eq = first.indexOf('=');
    if (eq <= 0) continue;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    // An empty value with a past expiry means "delete this cookie" —
    // honour that by removing the entry.
    if (!value && /\bexpires=/i.test(sc)) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }

  return Array.from(jar, ([k, v]) => `${k}=${v}`).join('; ');
}

export interface UploadLotResult {
  success: boolean;
  error?: string;
  debug?: string;
  updated_cookie?: string;
  // AF's assigned item id for this upload, parsed from the response's
  // final URL or body. Null when we couldn't extract one (either the
  // upload failed, or AF's response changed shape). When present, the
  // caller persists it to lots.af_item_id so audit/relot/dedupe can
  // join on a durable key instead of fragile lot_number arithmetic.
  af_item_id?: number | null;
  // Per-attempt telemetry fields. Written to af_upload_attempts by the
  // caller so we can finally diagnose which transient failure class
  // dominates in production (CSRF rotation vs PHPSESSID staleness vs
  // AF mod_security vs AF 5xx).
  http_status?: number;
  elapsed_ms?: number;
  csrf_present?: boolean;
  cookie_rotated?: boolean;
}

// Extract AF's assigned item id from a response URL or body. AF
// usually redirects to add_item.php?item=NNNN after a successful post,
// so the final URL carries it. The body occasionally embeds
// `item_detail.php?item=NNNN` instead. Returns the LARGEST id found
// (the just-created one) so pre-existing links in the page don't
// confuse us.
export function extractAfItemIdFromResponse(url: string, html: string): number | null {
  const ids: number[] = [];
  const urlMatch = url.match(/[?&]item=(\d+)/);
  if (urlMatch) ids.push(Number(urlMatch[1]));
  // After add_item.php posts, AF commonly includes a "View / Edit item"
  // link to the newly-created item. Scan for all item= refs and take
  // the max.
  const bodyRe = /\bitem=(\d+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = bodyRe.exec(html)) !== null) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) ids.push(n);
  }
  if (ids.length === 0) return null;
  // The brand-new item generally has the largest id. If AF ever changes
  // this (e.g. embeds older item ids after new ones), fall back to the
  // first id in the URL match.
  return Math.max(...ids);
}

export async function uploadLotToAF(
  lot: any,
  photos: { url: string; storage_path: string }[],
  afAuctionId: string,
  sessionCookie: string,
  saveAction: 'next' | 'exit'
): Promise<UploadLotResult> {
  const startedAt = Date.now();
  try {
    // AF's rebuilt backend 302-redirects /admin/add_item_2new.php to
    // /admin/add_item.php for everyone (not just logged-out users), so
    // we FOLLOW redirects here. Session expiry is detected by sniffing
    // the final body for the login form instead of trusting a 302.
    const initialUrl = `${AF_BASE}/add_item_2new.php?auction=${afAuctionId}`;
    const pageRes = await fetch(initialUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Cookie: sessionCookie,
      },
      redirect: 'follow',
    });
    // Pick up any rotated PHPSESSID / new cookies AF set on the GET.
    let currentCookie = mergeSetCookie(sessionCookie, pageRes);
    const cookieRotatedOnGet = currentCookie !== sessionCookie;

    const pageHtml = await pageRes.text();
    // Session-expiry check now runs on the final body — if AF bounced us
    // all the way to the login page, we'll see the login inputs here.
    if (/name=["']psEmail["']|name=["']psPassword["']/i.test(pageHtml)) {
      return {
        success: false,
        error: 'AF session expired. Please re-login.',
        updated_cookie: currentCookie,
        http_status: pageRes.status,
        elapsed_ms: Date.now() - startedAt,
        csrf_present: false,
        cookie_rotated: cookieRotatedOnGet,
      };
    }

    // After a 302 add_item_2new.php → add_item.php, the form POSTs back to
    // the current URL (its action is empty). Use the response's final URL
    // as our POST target so we don't ping-pong through the redirect each
    // time.
    const postUrl = pageRes.url || initialUrl;

    const getHidden = (name: string) => {
      const match = pageHtml.match(new RegExp(`name=["']${name}["'][^>]*value=["']([^"']*)["']`));
      return match ? match[1] : '';
    };

    const auctionInternal = getHidden('auction');
    const endDate = getHidden('end_date');
    const endTime = getHidden('end_time');
    const autoExtend = getHidden('auto_extend');
    const staggered = getHidden('staggered');
    // AF added CSRF protection on the rebuild. Every form POST needs the
    // token or AF returns HTTP 403 (FORBIDDEN_BY_AF). Pull it from the
    // same form page we're reading hidden fields from.
    const csrfToken = getHidden('af_csrf_token');

    if (!auctionInternal) {
      return {
        success: false,
        error: `Could not find auction hidden field. Page may not be the add_item form. First 200 chars: ${pageHtml.substring(0, 200)}`,
        http_status: pageRes.status,
        elapsed_ms: Date.now() - startedAt,
        csrf_present: !!csrfToken,
        cookie_rotated: cookieRotatedOnGet,
      };
    }

    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    let body = '';
    const addField = (name: string, value: string) => {
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="${name}"\r\n\r\n`;
      body += `${value}\r\n`;
    };

    // Send af_csrf_token FIRST — before any other field — so if AF's WAF
    // scans fields in order and bails on a missing token early, we never
    // hit that path.
    if (csrfToken) {
      addField('af_csrf_token', csrfToken);
    }
    addField('auction', auctionInternal);
    addField('auction_id', afAuctionId);
    addField('end_date', endDate);
    addField('end_time', endTime);
    addField('auto_extend', autoExtend);
    addField('staggered', staggered);

    addField('title', sanitizeForAF(lot.item_name || '', 255));
    addField('name', sanitizeForAF(lot.auction_description || '', 4000));
    addField('condition', CONDITION_MAP[lot.condition_rating] || '5 - Well used');
    addField('make', sanitizeForAF(lot.brand || '', 255));
    addField('model', sanitizeForAF(lot.model || '', 255));
    addField('qty', String(lot.quantity || 1));
    addField('original_price', String(lot.estimated_retail_new || ''));
    // Per-lot starting bid override, else the historical $1.00 default.
    addField(
      'start',
      lot.starting_bid !== null && lot.starting_bid !== undefined
        ? Number(lot.starting_bid).toFixed(2)
        : '1.00'
    );
    addField('reserve', '0.00');
    addField('buyitnow', '0.00');
    addField('taxable', 'yes');
    addField('width', lot.width || '');
    addField('depth', lot.depth || '');
    addField('height', lot.height || '');
    addField('youtube', '');

    if (saveAction === 'next') {
      addField('next', 'Next Item');
    } else {
      addField('exit', 'Save & Exit');
    }

    const photoParts: {
      name: string;
      filename: string;
      data: Buffer;
      contentType: string;
    }[] = [];
    for (let i = 0; i < photos.length; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const photoRes = await fetch(photos[i].url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!photoRes.ok) continue;
        const arrayBuf = await photoRes.arrayBuffer();
        // Normalize every photo to AF spec right before upload: upscale
        // if below AF_MIN_DIMENSION, re-encode as JPEG. Stock images
        // that would otherwise be rejected for being too small now meet
        // AF's validator every time. User photos are already fine, this
        // just re-encodes them which is harmless.
        const normalized = await normalizeImageForAF(Buffer.from(arrayBuf));
        photoParts.push({
          name: 'file[]',
          filename: `photo_${i}.jpg`,
          data: normalized,
          contentType: 'image/jpeg',
        });
      } catch {}
    }

    const textEncoder = new TextEncoder();
    const parts: Uint8Array[] = [];
    parts.push(textEncoder.encode(body));

    for (const photo of photoParts) {
      let filePart = `--${boundary}\r\n`;
      filePart += `Content-Disposition: form-data; name="${photo.name}"; filename="${photo.filename}"\r\n`;
      filePart += `Content-Type: ${photo.contentType}\r\n\r\n`;
      parts.push(textEncoder.encode(filePart));
      parts.push(new Uint8Array(photo.data));
      parts.push(textEncoder.encode('\r\n'));
    }

    if (photoParts.length === 0) {
      let emptyFile = `--${boundary}\r\n`;
      emptyFile += `Content-Disposition: form-data; name="file[]"; filename=""\r\n`;
      emptyFile += `Content-Type: application/octet-stream\r\n\r\n`;
      parts.push(textEncoder.encode(emptyFile));
      parts.push(textEncoder.encode('\r\n'));
    }

    parts.push(textEncoder.encode(`--${boundary}--\r\n`));

    const totalLength = parts.reduce((acc, p) => acc + p.length, 0);
    const fullBody = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      fullBody.set(part, offset);
      offset += part.length;
    }

    // Post to the final URL from the GET (after any redirect). AF's new
    // backend redirects add_item_2new.php → add_item.php, and the form's
    // action is empty (= submit to current URL), so this matches browser
    // behavior.
    const postController = new AbortController();
    const postTimeoutId = setTimeout(() => postController.abort(), 40000);
    const res = await fetch(postUrl, {
      method: 'POST',
      headers: {
        Cookie: currentCookie,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'User-Agent': BROWSER_UA,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: postUrl,
        Origin: 'https://auctionfactory.com',
      },
      body: fullBody,
      redirect: 'follow',
      signal: postController.signal,
    });
    clearTimeout(postTimeoutId);
    // Capture any new PHPSESSID AF handed back after the POST so the
    // caller can roll it forward to the next lot.
    const cookieBeforePost = currentCookie;
    currentCookie = mergeSetCookie(currentCookie, res);
    const cookieRotatedOnPost = currentCookie !== cookieBeforePost;

    const html = await res.text();
    const status = res.status;
    const location = res.headers.get('location') || '';
    const debug = html.substring(0, 500);
    const finalUrl = res.url || postUrl;
    const telemetry = {
      http_status: status,
      elapsed_ms: Date.now() - startedAt,
      csrf_present: !!csrfToken,
      cookie_rotated: cookieRotatedOnGet || cookieRotatedOnPost,
    };

    // redirect: 'follow' is set above, so a 302 → login would have been
    // resolved before we get here (the login markers scan at the end of
    // the 200 branch catches it). The 302 branch is kept as defensive
    // code for the case where follow didn't fire (e.g. CORS, redirect
    // limit).
    if (status === 302) {
      if (
        location.includes('Login') ||
        location.includes('login') ||
        location.includes('index.php')
      ) {
        return {
          success: false,
          error: 'AF session expired. Please re-login.',
          updated_cookie: currentCookie,
          ...telemetry,
        };
      }
      // A 302 to a non-login URL is a successful upload — AF usually
      // redirects to add_item.php?item=NNNN or similar.
      return {
        success: true,
        debug: `302 -> ${location}`,
        updated_cookie: currentCookie,
        af_item_id: extractAfItemIdFromResponse(location || finalUrl, html),
        ...telemetry,
      };
    }

    if (
      status === 403 ||
      html.includes('Forbidden') ||
      html.includes("don't have permission")
    ) {
      const itemName = (lot.item_name || '').substring(0, 80);
      return {
        success: false,
        error: `FORBIDDEN_BY_AF: ${status} - item: ${itemName}`,
        updated_cookie: currentCookie,
        ...telemetry,
      };
    }

    if (status === 200) {
      if (html.includes('psEmail') || html.includes('psPassword')) {
        return {
          success: false,
          error: 'AF session expired. Please re-login.',
          updated_cookie: currentCookie,
          ...telemetry,
        };
      }
      // False-positive-success guard: if the response body still shows
      // the add_item form (title/make/model inputs), the POST probably
      // didn't take. A real success either redirects to the lot's
      // detail page or renders a "saved!" confirmation.
      const stillOnForm = /name=["']title["'][^>]*>/i.test(html) &&
        /name=["']original_price["']/i.test(html);
      const sawServerError = /mod_security|forbidden|error_log|<title>\s*Error/i.test(html);
      if (stillOnForm && sawServerError) {
        return {
          success: false,
          error: `AF_REJECTED_SOFT: 200 but body shows error. Debug: ${debug.substring(0, 200)}`,
          updated_cookie: currentCookie,
          ...telemetry,
        };
      }
      return {
        success: true,
        updated_cookie: currentCookie,
        af_item_id: extractAfItemIdFromResponse(finalUrl, html),
        ...telemetry,
      };
    }

    return {
      success: false,
      error: `HTTP ${status}. Debug: ${debug}`,
      updated_cookie: currentCookie,
      ...telemetry,
    };
  } catch (err: any) {
    const elapsed_ms = Date.now() - startedAt;
    if (err.name === 'AbortError' || err.message?.includes('aborted')) {
      return {
        success: false,
        error: 'TIMEOUT_UNCERTAIN: upload may have succeeded on AF',
        elapsed_ms,
      };
    }
    return {
      success: false,
      error: `NETWORK_ERROR: ${err.message}`,
      elapsed_ms,
    };
  }
}
