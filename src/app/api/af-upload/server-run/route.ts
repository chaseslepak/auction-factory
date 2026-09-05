import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { uploadLotToAF } from '@/lib/af-upload-lib';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// Per-lot wall clock: ~40s for the HTTP POST + 3s inter-lot delay = 43s.
// Time budget is what we allow before self-invoking a fresh invocation to
// continue processing. Leaves headroom for the final upload to finish.
const PER_LOT_BUDGET_MS = 43_000;
const TIME_BUDGET_MS = 45_000;

// Background AF sync. Same behavior as the client-driven /api/af-upload
// batch loop, but invoked once from the browser and then self-invoked
// server-side until every unuploaded lot for the given auction is done.
// The user can close their tab — Vercel's waitUntil keeps the chain going.
//
// Auth: user session (client kick) OR CRON_SECRET (self-invoke). Same
// pattern as /api/jobs/process.
export async function POST(request: NextRequest) {
  const start = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  const isCronOrServer = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCronOrServer) {
    const userClient = createClient();
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const { auction_id } = await request.json();
  if (!auction_id) {
    return NextResponse.json({ error: 'auction_id required' }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'Service role key not configured' },
      { status: 500 }
    );
  }
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey
  );

  const [{ data: session }, { data: mapping }] = await Promise.all([
    supabase.from('af_session').select('session_cookie').eq('id', 1).single(),
    supabase
      .from('af_auction_map')
      .select('af_auction_id')
      .eq('auction_id', auction_id)
      .single(),
  ]);

  if (!session?.session_cookie) {
    return NextResponse.json(
      { error: 'No AF session. Please connect your Auction Factory account first.' },
      { status: 400 }
    );
  }
  if (!mapping?.af_auction_id) {
    return NextResponse.json(
      { error: 'No AF auction linked. Please link an AF auction first.' },
      { status: 400 }
    );
  }

  let cookieUsed = session.session_cookie;
  try {
    const { decrypt } = await import('@/lib/crypto');
    cookieUsed = decrypt(cookieUsed);
  } catch {}

  // Reset stuck 'uploading' rows older than 2 minutes back to failed so a
  // dead previous run can't block the queue forever.
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  await supabase
    .from('lots')
    .update({
      af_upload_status: 'failed',
      af_upload_error: 'Previous server-run crashed mid-upload — retryable',
    })
    .eq('auction_id', auction_id)
    .eq('af_upload_status', 'uploading')
    .lt('updated_at', twoMinutesAgo);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let sessionExpired = false;

  while (Date.now() - start < TIME_BUDGET_MS - PER_LOT_BUDGET_MS) {
    // Grab the next unuploaded lot (null / queued / failed) atomically:
    // find one, then update-if-still-eligible so two concurrent runs can't
    // both pick the same lot.
    const { data: candidates } = await supabase
      .from('lots')
      .select('id')
      .eq('auction_id', auction_id)
      .is('deleted_at', null)
      .or(
        'af_upload_status.is.null,af_upload_status.eq.queued,af_upload_status.eq.failed'
      )
      .order('lot_number', { ascending: true })
      .limit(1);

    if (!candidates?.length) break;

    const { data: claimedRows } = await supabase
      .from('lots')
      .update({ af_upload_status: 'uploading', af_upload_error: null })
      .eq('id', candidates[0].id)
      .or(
        'af_upload_status.is.null,af_upload_status.eq.queued,af_upload_status.eq.failed'
      )
      .select('*, lot_photos(*)');

    const claimed = claimedRows?.[0];
    if (!claimed) continue; // Someone else grabbed it

    // Inter-lot delay to be gentle to AF. Skip for the first lot.
    if (processed > 0) {
      await new Promise((r) => setTimeout(r, 3000));
    }

    const MAX_PHOTOS = 10;
    const photos = ((claimed as any).lot_photos || [])
      .slice()
      .sort(
        (a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0)
      )
      .slice(0, MAX_PHOTOS)
      .map((p: any) => ({
        url: supabase.storage.from('lot-photos').getPublicUrl(p.storage_path).data
          .publicUrl,
        storage_path: p.storage_path,
      }));

    // Retry only on NETWORK_ERROR (no HTTP response) — any actual HTTP
    // response means AF may have processed the request; retrying would
    // create a duplicate.
    let result = await uploadLotToAF(
      claimed,
      photos,
      mapping.af_auction_id,
      cookieUsed,
      'exit'
    );
    let retryCount = 0;
    while (
      !result.success &&
      retryCount < 2 &&
      result.error?.startsWith('NETWORK_ERROR:')
    ) {
      await new Promise((r) => setTimeout(r, 1000 * (retryCount + 1)));
      result = await uploadLotToAF(
        claimed,
        photos,
        mapping.af_auction_id,
        cookieUsed,
        'exit'
      );
      retryCount++;
    }

    // Timeouts get 'uploaded' with a note (usually did succeed on AF).
    const isTimeout = result.error?.includes('TIMEOUT_UNCERTAIN');
    await supabase
      .from('lots')
      .update({
        af_upload_status: result.success || isTimeout ? 'uploaded' : 'failed',
        af_upload_error: isTimeout
          ? 'Upload timed out — may have succeeded, verify on AF'
          : result.error || null,
      })
      .eq('id', (claimed as any).id);

    processed++;
    if (result.success || isTimeout) succeeded++;
    else failed++;

    if (result.error?.includes('session expired')) {
      sessionExpired = true;
      break;
    }
  }

  // Count what's left. Any lot still null/queued/failed IS pending work.
  const { count: remaining } = await supabase
    .from('lots')
    .select('id', { count: 'exact', head: true })
    .eq('auction_id', auction_id)
    .is('deleted_at', null)
    .or('af_upload_status.is.null,af_upload_status.eq.queued,af_upload_status.eq.failed');

  // Self-invoke to keep the chain going if there's more to do and the
  // session is still valid.
  if (!sessionExpired && remaining && remaining > 0) {
    const origin = request.nextUrl.origin;
    const selfInvokeUrl = `${origin}/api/af-upload/server-run`;
    const selfInvokeHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (cronSecret) {
      selfInvokeHeaders.Authorization = `Bearer ${cronSecret}`;
    }
    const body = JSON.stringify({ auction_id });

    try {
      const { waitUntil } = await import('@vercel/functions');
      waitUntil(
        fetch(selfInvokeUrl, {
          method: 'POST',
          headers: selfInvokeHeaders,
          body,
        }).catch(() => {})
      );
    } catch {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1500);
      try {
        await fetch(selfInvokeUrl, {
          method: 'POST',
          headers: selfInvokeHeaders,
          body,
          signal: controller.signal,
        });
      } catch {
        // Aborted — the request was still dispatched
      } finally {
        clearTimeout(timeoutId);
      }
    }
  }

  return NextResponse.json({
    processed,
    succeeded,
    failed,
    remaining: remaining || 0,
    sessionExpired,
    elapsed: Date.now() - start,
  });
}
