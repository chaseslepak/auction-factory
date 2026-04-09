import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

async function fetchWithCookie(url: string, cookie: string, options: RequestInit = {}) {
  return fetch(url, {
    ...options,
    headers: {
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
    // First, GET the add_item page to find hidden field values and the correct URL
    const getUrl = `${AF_BASE}/add_item.php?auction_id=${afAuctionId}`;
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
    addField('width', '');
    addField('depth', '');
    addField('height', '');
    addField('youtube', '');

    // Save action button
    if (saveAction === 'next') {
      addField('next', 'Next Item');
    } else {
      addField('exit', 'Save & Exit');
    }

    // Download and attach photos as binary parts
    const photoParts: { name: string; filename: string; data: Buffer; contentType: string }[] = [];
    for (let i = 0; i < photos.length; i++) {
      const photoRes = await fetch(photos[i].url);
      const arrayBuf = await photoRes.arrayBuffer();
      photoParts.push({
        name: 'file[]',
        filename: `photo_${i}.jpg`,
        data: Buffer.from(arrayBuf),
        contentType: 'image/jpeg',
      });
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

    // POST to AF add_item page
    const url = `${AF_BASE}/add_item.php?auction_id=${afAuctionId}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Cookie: sessionCookie,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: fullBody,
      redirect: 'follow',
    });

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

    if (status === 200) {
      if (html.includes('psEmail') || html.includes('psPassword')) {
        return { success: false, error: 'AF session expired. Please re-login.' };
      }
      // Check if the page shows a new empty form (= previous item was saved)
      if (html.includes('Item Name') && html.includes('value=""')) {
        return { success: true, debug: 'Got new empty form' };
      }
      // Return debug info so we can see what happened
      return { success: false, error: `AF returned 200 but unclear if saved. Debug: ${debug}` };
    }

    return { success: false, error: `HTTP ${status}. Debug: ${debug}` };
  } catch (err: any) {
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

  // Verify session is still valid
  const checkRes = await fetchWithCookie(`${AF_BASE}/auctions.php`, session.session_cookie);
  if (checkRes.status === 302 || checkRes.status === 401) {
    return NextResponse.json(
      { error: 'AF session expired. Please re-login to Auction Factory.' },
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

    // Get public URLs for photos
    const photos = (lot.lot_photos || []).map((p: any) => ({
      url: supabase.storage.from('lot-photos').getPublicUrl(p.storage_path).data.publicUrl,
      storage_path: p.storage_path,
    }));

    const result = await uploadLotToAF(
      lot,
      photos,
      mapping.af_auction_id,
      session.session_cookie,
      isLast ? 'exit' : 'next'
    );

    // Update lot status
    await supabase
      .from('lots')
      .update({
        af_upload_status: result.success ? 'uploaded' : 'failed',
        af_upload_error: result.error || null,
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
  }

  return NextResponse.json({ results });
}
