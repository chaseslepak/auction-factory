import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { uploadLotToAF } from '@/lib/af-upload-lib';

// Increase Vercel function timeout (max 60s on Hobby plan)
export const maxDuration = 60;

const AF_BASE = 'https://www.auctionfactory.com/admin';

// Client-driven per-batch upload endpoint (in-browser loop, dies on
// navigate-away). The background version that survives navigation lives
// at /api/af-upload/server-run. Both share uploadLotToAF from the lib.
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

  // Hard cap: each lot can take up to ~43s (40s timeout + 3s delay). On a 60s
  // Vercel function this means 1 lot per call is the only truly safe batch.
  // Allow up to 3 as a guardrail for small manual retries, but reject anything
  // larger so we don't hit function timeouts and leave lots in uploading state.
  if (lot_ids.length > 3) {
    return NextResponse.json(
      { error: `Batch too large (${lot_ids.length}). Max 3 lots per call — the client should batch.` },
      { status: 400 }
    );
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

  const { data: allRequestedLots } = await supabase
    .from('lots')
    .select('*, lot_photos(*)')
    .in('id', lot_ids)
    .is('deleted_at', null)
    .order('lot_number', { ascending: true });

  if (!allRequestedLots?.length) {
    return NextResponse.json({ error: 'No lots found' }, { status: 404 });
  }

  // SAFETY GUARD: never re-upload a lot marked uploaded.
  const skipped = allRequestedLots.filter((l: any) => l.af_upload_status === 'uploaded');
  const candidates = allRequestedLots.filter((l: any) => l.af_upload_status !== 'uploaded');

  const results: { lot_id: string; lot_number: number; success: boolean; error?: string; skipped?: boolean }[] = [];
  for (const s of skipped) {
    results.push({
      lot_id: s.id,
      lot_number: s.lot_number,
      success: false,
      skipped: true,
      error: 'Already uploaded to AF — refusing to re-send. To intentionally re-upload, clear this lot\'s AF status first (delete from AF, then use the per-lot Re-upload button).',
    });
  }

  if (candidates.length === 0) {
    return NextResponse.json({ results });
  }

  // Atomic claim to prevent two runs double-uploading the same lot.
  const { data: claimed } = await supabase
    .from('lots')
    .update({ af_upload_status: 'uploading', af_upload_error: null })
    .in('id', candidates.map((l: any) => l.id))
    .is('deleted_at', null)
    .or('af_upload_status.is.null,af_upload_status.eq.queued,af_upload_status.eq.failed')
    .select('id');

  const claimedIds = new Set((claimed || []).map((r: any) => r.id));
  const lots = candidates.filter((l: any) => claimedIds.has(l.id));

  for (const c of candidates) {
    if (!claimedIds.has(c.id)) {
      results.push({
        lot_id: c.id,
        lot_number: c.lot_number,
        success: false,
        skipped: true,
        error: 'Already being uploaded by another run — refusing to double-send.',
      });
    }
  }

  if (lots.length === 0) {
    return NextResponse.json({ results });
  }

  for (let i = 0; i < lots.length; i++) {
    const lot = lots[i];
    const isLast = i === lots.length - 1;

    if (i > 0) {
      await new Promise((r) => setTimeout(r, 3000));
    }

    try {
      const MAX_PHOTOS = 10;
      const photos = (lot.lot_photos || [])
        .slice()
        .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
        .slice(0, MAX_PHOTOS)
        .map((p: any) => ({
          url: supabase.storage.from('lot-photos').getPublicUrl(p.storage_path).data.publicUrl,
          storage_path: p.storage_path,
        }));

      let result = await uploadLotToAF(
        lot,
        photos,
        mapping.af_auction_id,
        cookieUsed,
        isLast ? 'exit' : 'next'
      );
      let retryCount = 0;
      while (!result.success && retryCount < 2 && result.error?.startsWith('NETWORK_ERROR:')) {
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
          [],
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

      if (result.error?.includes('session expired')) {
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
