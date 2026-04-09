import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Condition rating map: our 1-10 to AF's dropdown values
const CONDITION_MAP: Record<number, string> = {
  10: '10 - New in box',
  9: '9 - Like new',
  8: '8 - Excellent',
  7: '7 - Very Good',
  6: '6 - Good',
  5: '5 - Average',
  4: '4 - Below Average',
  3: '3 - Fair',
  2: '2 - Poor',
  1: '1 - Parts Only',
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
): Promise<{ success: boolean; error?: string }> {
  try {
    // Build multipart form data
    const formData = new FormData();

    // Core fields from the AF form
    formData.append('item_name', lot.item_name || '');
    formData.append('item_description', lot.auction_description || '');
    formData.append('condition', CONDITION_MAP[lot.condition_rating] || '5 - Average');
    formData.append('make', lot.brand || '');
    formData.append('model', lot.model || '');
    formData.append('qty', String(lot.quantity || 1));
    formData.append('original_price', String(lot.estimated_retail_new || ''));
    formData.append('starting_bid', '1.00');
    formData.append('reserve', '0.00');
    formData.append('buy_it_now', '0.00');
    formData.append('taxable', 'yes');
    formData.append('width', '');
    formData.append('depth', '');
    formData.append('height', '');
    formData.append('youtube', '');

    // Save action
    if (saveAction === 'next') {
      formData.append('next_item', 'Next Item');
    } else {
      formData.append('save_exit', 'Save & Exit');
    }

    // Download and attach photos
    for (let i = 0; i < photos.length; i++) {
      const photoRes = await fetch(photos[i].url);
      const blob = await photoRes.blob();
      formData.append('photos[]', blob, `photo_${i}.jpg`);
    }

    // POST to AF add_item page
    const url = `${AF_BASE}/add_item.php?auction_id=${afAuctionId}`;
    const res = await fetchWithCookie(url, sessionCookie, {
      method: 'POST',
      body: formData,
    });

    // Check response
    if (res.status === 302) {
      const location = res.headers.get('location') || '';
      // Redirect to login means session expired
      if (location.includes('Login') || location.includes('login') || location.includes('index.php')) {
        return { success: false, error: 'AF session expired. Please re-login.' };
      }
      // Redirect to add_item or auctions is success
      return { success: true };
    }

    if (res.status === 200) {
      const html = await res.text();
      // If we get the add_item form back, it likely succeeded and is showing the next item form
      if (html.includes('Item Name') || html.includes('item_name')) {
        return { success: true };
      }
      // If we get the login page back, session expired
      if (html.includes('psEmail') || html.includes('psPassword')) {
        return { success: false, error: 'AF session expired. Please re-login.' };
      }
      return { success: true };
    }

    return { success: false, error: `Unexpected response: ${res.status}` };
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
