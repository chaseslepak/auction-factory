import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { uploadLotToAF, UploadLotResult } from '@/lib/af-upload-lib';
import { fetchAdminItemList, normalizeTitle } from '@/lib/af-admin-scraper';

// Increase Vercel function timeout (max 60s on Hobby plan)
export const maxDuration = 60;

const AF_BASE = 'https://auctionfactory.com/admin';

// Service-role client for telemetry inserts (af_upload_attempts is
// policy-locked to server writes). We fall back to the user-scoped
// client when the service key isn't set so dev envs still work.
function telemetryClient(userClient: any) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return userClient;
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key);
}

// Check whether the lot's item_name already exists on AF under this
// auction, using the admin's authenticated item list. Returns the
// af_item_id when a match is found. Used to disambiguate uncertain
// upload results (TIMEOUT_UNCERTAIN, NETWORK_ERROR mid-POST) BEFORE
// retrying — if the first attempt actually landed, retrying creates a
// duplicate on AF.
async function checkIfAlreadyPosted(
  afAuctionId: string,
  cookie: string,
  itemName: string
): Promise<number | null> {
  if (!itemName) return null;
  try {
    const items = await fetchAdminItemList(afAuctionId, cookie);
    const needle = normalizeTitle(itemName);
    if (!needle) return null;
    const match = items.find((i) => normalizeTitle(i.title) === needle);
    return match ? match.af_item_id : null;
  } catch (err) {
    console.warn('checkIfAlreadyPosted failed:', err);
    return null;
  }
}

// Record a single upload attempt. Best-effort: schema mismatch or
// transient DB errors must never bubble out and fail the actual upload.
async function recordAttempt(
  client: any,
  lotId: string,
  attemptNum: number,
  result: UploadLotResult
): Promise<void> {
  try {
    const errorPrefix = result.error ? result.error.split(/:|—/)[0].trim().substring(0, 100) : null;
    await client.from('af_upload_attempts').insert({
      lot_id: lotId,
      attempt_num: attemptNum,
      success: !!result.success,
      http_status: result.http_status ?? null,
      error_prefix: errorPrefix,
      elapsed_ms: result.elapsed_ms ?? null,
      csrf_present: result.csrf_present ?? null,
      cookie_rotated: result.cookie_rotated ?? null,
      af_item_id: result.af_item_id ?? null,
    });
  } catch (e) {
    console.error('af_upload_attempts insert failed:', e);
  }
}

// Client-driven per-batch upload endpoint. Lots that fail land in
// af_upload_status='failed' with the specific af_upload_error — the
// client second-pass picks them up, and the server-side retry
// predicate (NETWORK_ERROR / FORBIDDEN_BY_AF 403 / 5xx / 429) already
// gives each lot up to 3 attempts per call.
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

  // Per-auction push lock. Prevents two concurrent HQ Pushes on the
  // same auction from racing each other's atomic claims. We refresh
  // (not just acquire) the lock on every call so a long batch loop
  // can hold it across many requests. Stale locks (older than 15 min)
  // are reclaimable — covers the case where the last client died
  // without releasing.
  const lockClient = telemetryClient(supabase);
  const lockHolder = user.email || user.id;
  const nowIso = new Date().toISOString();
  const expiresIso = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  try {
    const { data: existingLock } = await lockClient
      .from('auction_push_locks')
      .select('locked_by, locked_at, expires_at')
      .eq('auction_id', auction_id)
      .maybeSingle();
    if (existingLock) {
      const expired = new Date((existingLock as any).expires_at).getTime() < Date.now();
      const sameHolder = (existingLock as any).locked_by === lockHolder;
      if (!expired && !sameHolder) {
        return NextResponse.json(
          {
            error: `Another HQ Push is already running on this auction (started by ${(existingLock as any).locked_by || 'unknown'} at ${(existingLock as any).locked_at}). If that session died without releasing, wait 15 minutes for the lock to expire and try again.`,
          },
          { status: 409 }
        );
      }
    }
    await lockClient.from('auction_push_locks').upsert(
      {
        auction_id,
        locked_by: lockHolder,
        locked_at: nowIso,
        expires_at: expiresIso,
      },
      { onConflict: 'auction_id' }
    );
  } catch (err) {
    // Lock failure is non-fatal — the atomic claim at the row level is
    // the backstop. Log for diagnosis and continue.
    console.error('auction_push_locks acquire failed:', err);
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
  const FORM_MARKERS = [
    /name=["']auction["']/i,
    /name=["']title["']/i,
    /name=["']original_price["']/i,
    /name=["']condition["']/i,
    /add_item_2new/i,
  ];
  const checkUrl = `${AF_BASE}/add_item_2new.php?auction=${mapping.af_auction_id}`;

  async function sessionCheck(ck: string) {
    const r = await fetch(checkUrl, { headers: { Cookie: ck }, redirect: 'follow' });
    const h = await r.text();
    const login = /name=["']psEmail["']|name=["']psPassword["']/i.test(h);
    const form = FORM_MARKERS.some((rx) => rx.test(h));
    return { res: r, html: h, login, form };
  }

  let check = await sessionCheck(cookieUsed);

  // Auto-renewal: if the stored cookie puts us on the login form AND
  // AF_LOGIN_* env creds are present, try one re-login before giving
  // up. Rate-limited by /api/af-session/renew itself (10-min minimum).
  if ((check.login || !check.form) && process.env.AF_LOGIN_EMAIL && process.env.AF_LOGIN_PASSWORD) {
    try {
      const { renewAfSession } = await import('@/lib/af-session-renewer');
      const { encrypt } = await import('@/lib/crypto');
      const renew = await renewAfSession();
      if (renew.success && renew.cookie) {
        cookieUsed = renew.cookie;
        let stored = renew.cookie;
        try { stored = encrypt(renew.cookie); } catch {}
        const nowIso = new Date().toISOString();
        const telem = telemetryClient(supabase);
        const first = await telem.from('af_session').upsert({
          id: 1, session_cookie: stored, updated_at: nowIso, last_renewed_at: nowIso,
        });
        if (first.error && /last_renewed_at/.test(first.error.message || '')) {
          await telem.from('af_session').upsert({ id: 1, session_cookie: stored, updated_at: nowIso });
        }
        check = await sessionCheck(cookieUsed);
      }
    } catch {}
  }

  if (check.login || !check.form) {
    return NextResponse.json(
      {
        error: `AF session check failed. Cookie: ${cookieUsed.substring(0, 30)}..., URL: ${checkUrl}, Status: ${check.res.status}, HasLogin: ${check.login}, HasForm: ${check.form}, First500: ${check.html.substring(0, 500)}`
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

  // PRE-FLIGHT PHOTO VALIDATION: AF rejects lots with zero photos as
  // "Photo upload needs attention". Catch that locally so Chase sees
  // "no photos" instead of a confusing AF-side error. Marks the lot
  // 'failed' with an actionable message and skips the upload entirely.
  const noPhotos: typeof candidates = [];
  const pushable: typeof candidates = [];
  for (const c of candidates) {
    const hasPhoto = Array.isArray(c.lot_photos) && c.lot_photos.length > 0;
    if (hasPhoto) {
      pushable.push(c);
    } else {
      noPhotos.push(c);
    }
  }
  if (noPhotos.length > 0) {
    await supabase
      .from('lots')
      .update({
        af_upload_status: 'failed',
        af_upload_error:
          'NO_PHOTOS: lot has zero photos — AF will reject. Add a photo (or run Find Stock Images) and retry.',
      })
      .in('id', noPhotos.map((l: any) => l.id));
    for (const n of noPhotos) {
      results.push({
        lot_id: n.id,
        lot_number: n.lot_number,
        success: false,
        skipped: true,
        error: 'NO_PHOTOS: lot has zero photos — AF will reject. Add a photo (or run Find Stock Images) and retry.',
      });
    }
  }

  if (pushable.length === 0) {
    return NextResponse.json({ results });
  }
  // From here on, treat `candidates` as the photo-passing subset.
  candidates.length = 0;
  candidates.push(...pushable);

  // Reclaim stuck 'uploading' lots: if a prior client-side batch died
  // mid-run (tab closed, laptop sleep, network drop), the server set
  // 'uploading' but the client never came back. Those lots sat in
  // limbo and the atomic claim below would skip them. 5 minutes is
  // comfortably longer than one lot's wall-clock (40s timeout + 3s
  // delay × a few retries), so anything stuck past 5 min is definitely
  // orphaned.
  const stuckCutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  await supabase
    .from('lots')
    .update({ af_upload_status: 'failed', af_upload_error: 'Reclaimed from stuck uploading state (prior batch died mid-run)' })
    .in('id', candidates.map((l: any) => l.id))
    .eq('af_upload_status', 'uploading')
    .lt('updated_at', stuckCutoff);

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

      const tc = telemetryClient(supabase);
      let attemptNum = 1;
      let result = await uploadLotToAF(
        lot,
        photos,
        mapping.af_auction_id,
        cookieUsed,
        isLast ? 'exit' : 'next'
      );
      await recordAttempt(tc, lot.id, attemptNum, result);
      // Roll the cookie forward — AF rotates PHPSESSID on each form
      // POST, so the next lot MUST use the latest value or AF bounces
      // us to the login page mid-batch.
      if (result.updated_cookie) cookieUsed = result.updated_cookie;

      // Idempotency disambiguation on uncertain results. TIMEOUT_UNCERTAIN
      // and NETWORK_ERROR both leave open the question "did AF actually
      // receive the POST?" If we blindly retry, a successful first POST
      // becomes a duplicate on AF. Query the admin item list for the
      // lot's item_name — if it's already there, treat this as a
      // successful upload with the found af_item_id instead of retrying.
      const isUncertain =
        !result.success &&
        (result.error?.includes('TIMEOUT_UNCERTAIN') || result.error?.startsWith('NETWORK_ERROR:'));
      if (isUncertain && lot.item_name) {
        const foundId = await checkIfAlreadyPosted(
          mapping.af_auction_id,
          cookieUsed,
          lot.item_name
        );
        if (foundId) {
          // The first POST landed. Treat as success. Prevents a
          // duplicate on the next retry.
          result = {
            success: true,
            af_item_id: foundId,
            updated_cookie: cookieUsed,
            http_status: result.http_status,
            elapsed_ms: result.elapsed_ms,
            csrf_present: result.csrf_present,
            cookie_rotated: result.cookie_rotated,
            debug: `recovered via admin item list after ${result.error}`,
          };
          attemptNum++;
          await recordAttempt(tc, lot.id, attemptNum, result);
        }
      }

      // Retry transient failures: NETWORK_ERROR, FORBIDDEN_BY_AF (CSRF
      // rotation; next attempt refetches a fresh token), HTTP 5xx,
      // HTTP 429. Up to 3 retries with exponential backoff. Never
      // retry session-expired (early-aborts the batch below) or
      // TIMEOUT_UNCERTAIN (may have ACTUALLY uploaded on AF).
      const isTransient = (err?: string): boolean => {
        if (!err) return false;
        if (err.startsWith('NETWORK_ERROR:')) return true;
        if (/^FORBIDDEN_BY_AF:\s*403\b/.test(err)) return true;
        const m = err.match(/^HTTP\s+(\d+)/);
        if (m) {
          const code = Number(m[1]);
          if (code === 429 || (code >= 500 && code < 600)) return true;
        }
        return false;
      };
      while (!result.success && attemptNum < 4 && isTransient(result.error)) {
        // Backoff: 1s, 2s, 4s. 429s get 2× so AF's rate-limit window resets.
        const base = result.error?.includes('429') ? 2000 : 1000;
        await new Promise((r) => setTimeout(r, base * Math.pow(2, attemptNum - 1)));
        result = await uploadLotToAF(
          lot,
          photos,
          mapping.af_auction_id,
          cookieUsed,
          isLast ? 'exit' : 'next'
        );
        attemptNum++;
        await recordAttempt(tc, lot.id, attemptNum, result);
        if (result.updated_cookie) cookieUsed = result.updated_cookie;
      }

      const isTimeoutResult = result.error?.includes('TIMEOUT_UNCERTAIN');
      // Write af_item_id when we captured one — the single most
      // important durable value from a successful upload. Audits and
      // relot-sync will prefer this over lot_number matching.
      const updates: any = {
        af_upload_status: result.success || isTimeoutResult ? 'uploaded' : 'failed',
        af_upload_error: isTimeoutResult
          ? 'Upload timed out — may have succeeded, verify on AF'
          : result.error || null,
      };
      if (result.success && result.af_item_id) {
        updates.af_item_id = result.af_item_id;
      }
      await supabase.from('lots').update(updates).eq('id', lot.id);

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

  // Persist the rotated cookie back to Supabase so the NEXT HTTP
  // invocation (next batch, next page refresh, next audit) starts with
  // the current PHPSESSID instead of a stale one. Encrypt before storing.
  try {
    const originalCookie = session.session_cookie;
    const freshValue =
      cookieUsed && cookieUsed !== originalCookie ? cookieUsed : null;
    if (freshValue) {
      let toStore = freshValue;
      try {
        const { encrypt } = await import('@/lib/crypto');
        toStore = encrypt(freshValue);
      } catch {}
      await supabase
        .from('af_session')
        .update({ session_cookie: toStore, updated_at: new Date().toISOString() })
        .eq('id', 1);
    }
  } catch (e) {
    console.error('Failed to persist rotated AF cookie:', e);
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

  // Release the per-auction lock so a follow-up push doesn't have to
  // wait 15 min. Best-effort: a failure here just means the lock
  // expires naturally.
  try {
    await lockClient
      .from('auction_push_locks')
      .delete()
      .eq('auction_id', auction_id)
      .eq('locked_by', lockHolder);
  } catch {}

  return NextResponse.json({ results });
}
