import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Increase Vercel function timeout (max 60s on Hobby plan)
export const maxDuration = 60;

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

async function fetchWithCookie(url: string, cookie: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: {
      'User-Agent': BROWSER_UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...options.headers as Record<string, string>,
      Cookie: cookie,
    },
    redirect: 'manual',
  });
}

async function uploadLotToAF(
  lot: any,
  photos: { url: string; storage_path: string }[],
  afAuctionId: string,
  sessionCookie: string,
  saveAction: 'next' | 'exit'
): Promise<{ success: boolean; error?: string; debug?: string }> {
  try {
    // GET the add_item form using the correct URL with internal auction ID
    const getUrl = `${AF_BASE}/add_item_2new.php?auction=${afAuctionId}`;
    const pageRes = await fetchWithCookie(getUrl, sessionCookie);

    if (pageRes.status === 302) {
      return { success: false, error: 'AF session expired. Please re-login.' };
    }

    const pageHtml = await pageRes.text();

    // Extract hidden field values from the form
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
      return { success: false, error: `Could not find auction hidden field. Page may not be the add_item form. First 200 chars: ${pageHtml.substring(0, 200)}` };
    }

    // Build the POST body as URLSearchParams first (no photos) to test basic submission
    // Then we'll add photos via multipart
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);
    let body = '';

    const addField = (name: string, value: string) => {
      body += `--${boundary}\r\n`;
      body += `Content-Disposition: form-data; name="${name}"\r\n\r\n`;
      body += `${value}\r\n`;
    };

    // Hidden fields
    addField('auction', auctionInternal);
    addField('auction_id', afAuctionId);
    addField('end_date', endDate);
    addField('end_time', endTime);
    addField('auto_extend', autoExtend);
    addField('staggered', staggered);

    // Visible fields
    addField('title', lot.item_name || '');
    addField('name', lot.auction_description || '');
    addField('condition', CONDITION_MAP[lot.condition_rating] || '5 - Well used');
    addField('make', lot.brand || '');
    addField('model', lot.model || '');
    addField('qty', String(lot.quantity || 1));
    addField('original_price', String(lot.estimated_retail_new || ''));
    addField('start', '1.00');
    addField('reserve', '0.00');
    addField('buyitnow', '0.00');
    addField('taxable', 'yes');
    addField('width', lot.width || '');
    addField('depth', lot.depth || '');
    addField('height', lot.height || '');
    addField('youtube', '');

    // Save action button
    if (saveAction === 'next') {
      addField('next', 'Next Item');
    } else {
      addField('exit', 'Save & Exit');
    }

    // Download and attach photos as binary parts (with timeout per photo)
    const photoParts: { name: string; filename: string; data: Buffer; contentType: string }[] = [];
    for (let i = 0; i < photos.length; i++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s per photo
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
      } catch {
        // Photo download failed — continue with the rest
      }
    }

    // Build the final multipart body with binary photo data
    const textEncoder = new TextEncoder();
    const parts: Uint8Array[] = [];

    // Add text fields
    parts.push(textEncoder.encode(body));

    // Add photo files
    for (const photo of photoParts) {
      let filePart = `--${boundary}\r\n`;
      filePart += `Content-Disposition: form-data; name="${photo.name}"; filename="${photo.filename}"\r\n`;
      filePart += `Content-Type: ${photo.contentType}\r\n\r\n`;
      parts.push(textEncoder.encode(filePart));
      parts.push(new Uint8Array(photo.data));
      parts.push(textEncoder.encode('\r\n'));
    }

    // If no photos, still send an empty file field
    if (photoParts.length === 0) {
      let emptyFile = `--${boundary}\r\n`;
      emptyFile += `Content-Disposition: form-data; name="file[]"; filename=""\r\n`;
      emptyFile += `Content-Type: application/octet-stream\r\n\r\n`;
      parts.push(textEncoder.encode(emptyFile));
      parts.push(textEncoder.encode('\r\n'));
    }

    // Close boundary
    parts.push(textEncoder.encode(`--${boundary}--\r\n`));

    // Combine all parts into a single buffer
    const totalLength = parts.reduce((acc, p) => acc + p.length, 0);
    const fullBody = new Uint8Array(totalLength);
    let offset = 0;
    for (const part of parts) {
      fullBody.set(part, offset);
      offset += part.length;
    }

    // POST to AF add_item form (same URL as GET) with 20s timeout
    const url = `${AF_BASE}/add_item_2new.php?auction=${afAuctionId}`;
    const postController = new AbortController();
    const postTimeoutId = setTimeout(() => postController.abort(), 40000);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: getUrl,
        Origin: 'https://www.auctionfactory.com',
      },
      body: fullBody,
      redirect: 'follow',
      signal: postController.signal,
    });
    clearTimeout(postTimeoutId);

    // Get response details for debugging
    const html = await res.text();
    const status = res.status;
    const location = res.headers.get('location') || '';

    // Debug: return first 500 chars of response
    const debug = html.substring(0, 500);

    if (status === 302) {
      if (location.includes('Login') || location.includes('login') || location.includes('index.php')) {
        return { success: false, error: 'AF session expired. Please re-login.' };
      }
      return { success: true, debug: `302 -> ${location}` };
    }

    // 403 Forbidden or response contains "Forbidden" = session dead
    if (status === 403 || html.includes('Forbidden') || html.includes("don't have permission")) {
      return { success: false, error: 'AF session expired. Please re-login.' };
    }

    if (status === 200) {
      if (html.includes('psEmail') || html.includes('psPassword')) {
        return { success: false, error: 'AF session expired. Please re-login.' };
      }
      // AF returns the admin page after a successful save — treat 200 as success
      // unless it's the login page
      return { success: true };
    }

    return { success: false, error: `HTTP ${status}. Debug: ${debug}` };
  } catch (err: any) {
    // AbortError = timeout. The upload MAY have succeeded on AF's side.
    // Don't retry, don't post placeholder — let user verify manually.
    if (err.name === 'AbortError' || err.message?.includes('aborted')) {
      return { success: false, error: 'TIMEOUT_UNCERTAIN: upload may have succeeded on AF' };
    }
    return { success: false, error: err.message };
  }
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { auction_id, lot_ids } = await request.json();

  if (!auction_id || !lot_ids?.length) {
    return NextResponse.json({ error: 'auction_id and lot_ids required' }, { status: 400 });
  }

  // Get AF session cookie
  const { data: session } = await supabase
    .from('af_session')
    .select('session_cookie')
    .eq('id', 1)
    .single();

  if (!session?.session_cookie) {
    return NextResponse.json(
      { error: 'No AF session. Please connect your Auction Factory account first.' },
      { status: 400 }
    );
  }

  // Get AF auction mapping
  const { data: mapping } = await supabase
    .from('af_auction_map')
    .select('af_auction_id')
    .eq('auction_id', auction_id)
    .single();

  if (!mapping?.af_auction_id) {
    return NextResponse.json(
      { error: 'No AF auction linked. Please link an AF auction first.' },
      { status: 400 }
    );
  }

  // Decrypt cookie if encrypted
  let cookieUsed = session.session_cookie;
  try {
    const { decrypt } = await import('@/lib/crypto');
    cookieUsed = decrypt(cookieUsed);
  } catch {}
  const checkUrl = `${AF_BASE}/add_item_2new.php?auction=${mapping.af_auction_id}`;
  const checkRes = await fetch(checkUrl, {
    headers: { Cookie: cookieUsed },
  });
  const checkHtml = await checkRes.text();
  const hasLogin = checkHtml.includes('psEmail') || checkHtml.includes('psPassword');
  const hasForm = checkHtml.includes('Item Name');
  if (hasLogin || !hasForm) {
    return NextResponse.json(
      {
        error: `AF session check failed. Cookie: ${cookieUsed.substring(0, 30)}..., URL: ${checkUrl}, Status: ${checkRes.status}, HasLogin: ${hasLogin}, HasForm: ${hasForm}, First200: ${checkHtml.substring(0, 200)}`
      },
      { status: 401 }
    );
  }

  // Get lots with photos
  const { data: lots } = await supabase
    .from('lots')
    .select('*, lot_photos(*)')
    .in('id', lot_ids)
    .order('lot_number', { ascending: true });

  if (!lots?.length) {
    return NextResponse.json({ error: 'No lots found' }, { status: 404 });
  }

  // Mark lots as uploading
  await supabase
    .from('lots')
    .update({ af_upload_status: 'uploading', af_upload_error: null })
    .in('id', lot_ids);

  const results: { lot_id: string; lot_number: number; success: boolean; error?: string }[] = [];

  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    const isLast = i === lots.length - 1;

    // Delay between requests to avoid AF rate limiting (3s)
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 3000));
    }

    try {
    // Get public URLs for photos, sorted by display_order (stock image = 0, first)
    // Note: Supabase image transform requires pro plan. Using regular URLs.
    // Photos are already resized client-side to ~1024px by image-utils.ts.
    const MAX_PHOTOS = 10;
    const photos = (lot.lot_photos || [])
      .slice()
      .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
      .slice(0, MAX_PHOTOS)
      .map((p: any) => ({
        url: supabase.storage.from('lot-photos').getPublicUrl(p.storage_path).data.publicUrl,
        storage_path: p.storage_path,
      }));

    // Retry up to 2 times on transient failures
    let result = await uploadLotToAF(
      lot,
      photos,
      mapping.af_auction_id,
      cookieUsed,
      isLast ? 'exit' : 'next'
    );
    let retryCount = 0;
    while (!result.success && retryCount < 2) {
      // Don't retry session expired errors
      if (result.error?.includes('session expired')) break;
      // Don't retry timeouts — the upload may have succeeded on AF's side
      if (result.error?.includes('TIMEOUT_UNCERTAIN')) break;
      // Wait before retry
      await new Promise((r) => setTimeout(r, 1000 * (retryCount + 1)));
      result = await uploadLotToAF(
        lot,
        photos,
        mapping.af_auction_id,
        cookieUsed,
        isLast ? 'exit' : 'next'
      );
      retryCount++;
    }

    // Post placeholder only for DEFINITIVE failures (not timeouts or session errors)
    // Timeouts may have succeeded on AF — we can't be sure, so don't add a placeholder
    // that would create a duplicate.
    const isTimeout = result.error?.includes('TIMEOUT_UNCERTAIN');
    const isSessionError = result.error?.includes('session expired');
    if (!result.success && !isSessionError && !isTimeout) {
      const placeholderLot = {
        item_name: `PLACEHOLDER - LOT #${lot.lot_number} - UPLOAD FAILED, DO NOT BID`,
        auction_description:
          'This lot failed to upload and is a placeholder to preserve lot numbering. It will be fixed or removed before auction goes live. DO NOT BID ON THIS LOT.',
        brand: '',
        model: '',
        category: '',
        condition_rating: 5,
        quantity: 1,
        estimated_retail_new: 1,
      };
      const placeholderResult = await uploadLotToAF(
        placeholderLot,
        [], // No photos
        mapping.af_auction_id,
        cookieUsed,
        isLast ? 'exit' : 'next'
      );
      if (placeholderResult.success) {
        result = {
          success: false,
          error: `Upload failed: ${result.error || 'unknown'}. Placeholder posted to AF to hold position.`,
        };
      }
    }

    // Update lot status
    // Timeouts get 'uploaded' status with a note — we assume they succeeded
    // since AF is usually slow, not broken. User can verify and delete if duplicate.
    const isTimeoutResult = result.error?.includes('TIMEOUT_UNCERTAIN');
    await supabase
      .from('lots')
      .update({
        af_upload_status: result.success || isTimeoutResult ? 'uploaded' : 'failed',
        af_upload_error: isTimeoutResult
          ? 'Upload timed out — may have succeeded, verify on AF'
          : result.error || null,
      })
      .eq('id', lot.id);

    results.push({
      lot_id: lot.id,
      lot_number: lot.lot_number,
      ...result,
    });

    // If session expired, stop uploading
    if (result.error?.includes('session expired')) {
      // Mark remaining lots as failed
      const remaining = lots.slice(i + 1).map((l: any) => l.id);
      if (remaining.length) {
        await supabase
          .from('lots')
          .update({ af_upload_status: 'failed', af_upload_error: 'Session expired before upload' })
          .in('id', remaining);
      }
      break;
    }
    } catch (lotErr: any) {
      // Any exception for this specific lot — mark as failed and continue with next
      console.error('Lot upload error:', lotErr?.message, 'lot:', lot.id);
      await supabase
        .from('lots')
        .update({
          af_upload_status: 'failed',
          af_upload_error: lotErr?.message || 'Unknown error',
        })
        .eq('id', lot.id);
      results.push({
        lot_id: lot.id,
        lot_number: lot.lot_number,
        success: false,
        error: lotErr?.message || 'Unknown error',
      });
    }
  }

  // Log activity for this upload batch
  try {
    const succeededIds = results.filter((r) => r.success).map((r) => r.lot_id);
    if (succeededIds.length > 0) {
      await supabase.from('activity_log').insert({
        user_email: user.email || 'unknown',
        action: 'uploaded_to_af',
        entity_type: 'lot',
        auction_id: auction_id,
        details: { count: succeededIds.length, lot_ids: succeededIds.slice(0, 20) },
      });
    }
  } catch {}

  return NextResponse.json({ results });
}
