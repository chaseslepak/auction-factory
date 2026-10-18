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

// Extract AF's assigned item id from a response URL. We ONLY trust the
// response URL's `?item=NNNN` — the body-scan approach we used before
// could pick up cross-auction ids from the admin chrome's sidebar /
// recent-items links (AF's add_item form embeds many `item=` refs that
// are NOT the just-created item). A wrong capture becomes permanent
// drift now that PR #83 removed the post-batch verify. Null returns
// here are self-healing: the pre-batch idempotency guard on the next
// push backfills af_item_id via title match.
export function extractAfItemIdFromResponse(url: string, _html: string): number | null {
  const m = url.match(/[?&]item=(\d+)/);
  return m ? Number(m[1]) : null;
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
    let droppedPhotos = 0;
    for (let i = 0; i < photos.length; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const photoRes = await fetch(photos[i].url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!photoRes.ok) {
          droppedPhotos++;
          continue;
        }
        const arrayBuf = await photoRes.arrayBuffer();
        // Normalize every photo to AF spec right before upload: upscale
        // if below AF_MIN_DIMENSION, re-encode as JPEG.
        const normalized = await normalizeImageForAF(Buffer.from(arrayBuf));
        photoParts.push({
          name: 'file[]',
          filename: `photo_${i}.jpg`,
          data: normalized,
          contentType: 'image/jpeg',
        });
      } catch {
        droppedPhotos++;
      }
    }
    // If >50% of expected photos failed to fetch, treat as BAD_PHOTOS
    // rather than quietly sending a reduced set to AF. The user needs
    // to know their lot is shipping with only partial photos.
    if (
      photos && photos.length >= 2 &&
      droppedPhotos > 0 &&
      droppedPhotos > photos.length / 2
    ) {
      return {
        success: false,
        error: `BAD_PHOTOS: ${droppedPhotos} of ${photos.length} photos failed to fetch at upload time. Check photo storage paths on this lot.`,
        http_status: 0,
        elapsed_ms: Date.now() - startedAt,
        csrf_present: !!csrfToken,
        cookie_rotated: cookieRotatedOnGet,
      };
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
      // DEFENSE: lot was supposed to have photos but all fetches failed
      // (broken storage paths, Supabase outage, corrupted files). Rather
      // than POST an empty file to AF and watch it reject with "Photo
      // upload needs attention," return a clean BAD_PHOTOS error so the
      // route marks the lot explicitly without hitting AF. If the lot
      // truly had zero photos in the DB, pre-flight NO_PHOTOS already
      // caught it — this path only fires when fetching the photos
      // during upload fails for all of them.
      if (photos && photos.length > 0) {
        return {
          success: false,
          error: 'BAD_PHOTOS: all photos failed to fetch at upload time (broken storage path or network). Check lot photos in the review page.',
          http_status: 0,
          elapsed_ms: Date.now() - startedAt,
          csrf_present: !!csrfToken,
          cookie_rotated: cookieRotatedOnGet,
        };
      }
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

// Generate a "Coming Soon" placeholder JPEG. SVG → sharp → JPEG so we
// don't need to bundle a prebuilt image. 500x500 at mozjpeg q85 lands
// around 8KB — safely above AF's photo-size thresholds.
export async function generatePlaceholderImage(lotNumber: number): Promise<Buffer> {
  const sharp = (await import('sharp')).default;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="500" viewBox="0 0 500 500">
  <rect width="500" height="500" fill="#f3f4f6"/>
  <rect x="40" y="40" width="420" height="420" fill="none" stroke="#9ca3af" stroke-width="4" stroke-dasharray="10,10"/>
  <text x="250" y="220" font-family="Helvetica, Arial, sans-serif" font-size="48" font-weight="bold" fill="#6b7280" text-anchor="middle">COMING SOON</text>
  <text x="250" y="280" font-family="Helvetica, Arial, sans-serif" font-size="32" fill="#9ca3af" text-anchor="middle">LOT ${lotNumber}</text>
  <text x="250" y="340" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#9ca3af" text-anchor="middle">Full listing being prepared</text>
</svg>`;
  return await sharp(Buffer.from(svg)).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
}

// Push a minimal "placeholder" item to AF to reserve this lot's
// position in the auction when the real lot can't be uploaded (missing
// data, photo rejection, etc). The real lot stays in the lotter marked
// 'placeholder' with the placeholder item's af_item_id; the next HQ
// Push detects that status and overwrites the placeholder with real
// content (via the edit flow when available, or create-and-relot
// otherwise).
//
// Returns the same UploadLotResult shape as uploadLotToAF so the
// caller can treat the two paths uniformly.
export async function createPlaceholderOnAF(
  realLot: any,
  afAuctionId: string,
  sessionCookie: string,
  saveAction: 'next' | 'exit',
): Promise<UploadLotResult> {
  const lotNumber = Number(realLot.lot_number) || 0;
  const stubLot = {
    item_name: `Coming Soon — Lot ${lotNumber}`,
    auction_description:
      'Placeholder item. The full listing for this lot is being prepared and will be posted shortly.',
    brand: '',
    model: '',
    quantity: 1,
    condition_rating: 10,
    estimated_retail_new: 0,
    starting_bid: 1,
    width: '',
    depth: '',
    height: '',
    lot_number: lotNumber,
  };

  const placeholderBuf = await generatePlaceholderImage(lotNumber);
  // Hand the uploader a synthetic in-memory photo. Rather than invent a
  // storage path, we embed the buffer directly as a data: URL that the
  // existing fetch(photos[i].url) path will decode.
  const dataUrl = `data:image/jpeg;base64,${placeholderBuf.toString('base64')}`;
  const photos = [{ url: dataUrl, storage_path: `__placeholder/lot_${lotNumber}.jpg` }];

  return await uploadLotToAF(stubLot, photos, afAuctionId, sessionCookie, saveAction);
}
