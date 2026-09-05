// Extracted from /api/af-upload/route.ts so both the per-batch client-driven
// endpoint AND the new server-run background endpoint can call it.
//
// This module does the actual POST-to-AF work for one lot. It has no
// route/auth concerns — pass in a decrypted AF session cookie and a lot
// row (with photos joined) and it returns success/failure.

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

const AF_BASE = 'https://www.auctionfactory.com/admin';

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

export async function uploadLotToAF(
  lot: any,
  photos: { url: string; storage_path: string }[],
  afAuctionId: string,
  sessionCookie: string,
  saveAction: 'next' | 'exit'
): Promise<{ success: boolean; error?: string; debug?: string }> {
  try {
    const getUrl = `${AF_BASE}/add_item_2new.php?auction=${afAuctionId}`;
    const pageRes = await fetchWithCookie(getUrl, sessionCookie);

    if (pageRes.status === 302) {
      return { success: false, error: 'AF session expired. Please re-login.' };
    }

    const pageHtml = await pageRes.text();
    const getHidden = (name: string) => {
      const match = pageHtml.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`));
      return match ? match[1] : '';
    };

    const auctionInternal = getHidden('auction');
    const endDate = getHidden('end_date');
    const endTime = getHidden('end_time');
    const autoExtend = getHidden('auto_extend');
    const staggered = getHidden('staggered');

    if (!auctionInternal) {
      return {
        success: false,
        error: `Could not find auction hidden field. Page may not be the add_item form. First 200 chars: ${pageHtml.substring(0, 200)}`,
      };
    }

    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    let body = '';
    const addField = (name: string, value: string) => {
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="${name}"\r\n\r\n`;
      body += `${value}\r\n`;
    };

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
        photoParts.push({
          name: 'file[]',
          filename: `photo_${i}.jpg`,
          data: Buffer.from(arrayBuf),
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

    const url = `${AF_BASE}/add_item_2new.php?auction=${afAuctionId}`;
    const postController = new AbortController();
    const postTimeoutId = setTimeout(() => postController.abort(), 40000);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'User-Agent': BROWSER_UA,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: getUrl,
        Origin: 'https://www.auctionfactory.com',
      },
      body: fullBody,
      redirect: 'follow',
      signal: postController.signal,
    });
    clearTimeout(postTimeoutId);

    const html = await res.text();
    const status = res.status;
    const location = res.headers.get('location') || '';
    const debug = html.substring(0, 500);

    if (status === 302) {
      if (
        location.includes('Login') ||
        location.includes('login') ||
        location.includes('index.php')
      ) {
        return { success: false, error: 'AF session expired. Please re-login.' };
      }
      return { success: true, debug: `302 -> ${location}` };
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
      };
    }

    if (status === 200) {
      if (html.includes('psEmail') || html.includes('psPassword')) {
        return { success: false, error: 'AF session expired. Please re-login.' };
      }
      return { success: true };
    }

    return { success: false, error: `HTTP ${status}. Debug: ${debug}` };
  } catch (err: any) {
    if (err.name === 'AbortError' || err.message?.includes('aborted')) {
      return { success: false, error: 'TIMEOUT_UNCERTAIN: upload may have succeeded on AF' };
    }
    return { success: false, error: `NETWORK_ERROR: ${err.message}` };
  }
}
