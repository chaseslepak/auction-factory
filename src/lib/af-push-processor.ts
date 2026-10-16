// AF push job processor.
//
// One af_push job = one lot pushed to AF. Runs the same uploadLotToAF
// path the per-request HQ Push does, so the lot goes through the same
// idempotency guards, telemetry, and af_item_id capture.
//
// Cookie forward-rolling: AF rotates PHPSESSID on every POST. The
// context parameter carries the latest cookie across sibling jobs
// within one processor invocation so each job uses the freshest value.
// On a new invocation (e.g. after self-tail), the context starts empty
// and the first af_push job re-reads from af_session.

import type { SupabaseClient } from '@supabase/supabase-js';
import { uploadLotToAF } from '@/lib/af-upload-lib';
import { fetchAdminItemList, normalizeTitle } from '@/lib/af-admin-scraper';
import { decrypt, encrypt } from '@/lib/crypto';

export interface AfPushContext {
  // Keyed by af_auction_id (string form). Each entry is the live
  // cookie after the most recent successful POST under that auction.
  cookiesByAfAuction: Map<string, string>;
  // True once we've validated session+cookie this invocation. On a
  // 401-equivalent response from AF, we trip this back off and the
  // next job will re-check.
  sessionChecked: boolean;
  // When we auto-renewed the session this invocation, persist once at
  // the end rather than writing on every rotation.
  cookieDirty: boolean;
}

export function newAfPushContext(): AfPushContext {
  return {
    cookiesByAfAuction: new Map(),
    sessionChecked: false,
    cookieDirty: false,
  };
}

async function getFreshCookie(
  supabase: SupabaseClient,
  afAuctionId: string,
  ctx: AfPushContext,
): Promise<string | null> {
  const cached = ctx.cookiesByAfAuction.get(afAuctionId);
  if (cached) return cached;
  const { data: sess } = await supabase
    .from('af_session')
    .select('session_cookie')
    .eq('id', 1)
    .single();
  if (!sess?.session_cookie) return null;
  let cookie = sess.session_cookie as string;
  try {
    cookie = decrypt(cookie);
  } catch {}
  ctx.cookiesByAfAuction.set(afAuctionId, cookie);
  return cookie;
}

async function persistCookieIfRotated(
  supabase: SupabaseClient,
  cookie: string,
  nowIso: string,
) {
  let stored = cookie;
  try {
    stored = encrypt(cookie);
  } catch {}
  await supabase.from('af_session').upsert({
    id: 1,
    session_cookie: stored,
    updated_at: nowIso,
  });
}

async function recordAttempt(
  supabase: SupabaseClient,
  lotId: string,
  attemptNum: number,
  result: any,
) {
  try {
    await supabase.from('af_upload_attempts').insert({
      lot_id: lotId,
      attempt_num: attemptNum,
      success: !!result.success,
      http_status: result.http_status ?? null,
      error_prefix: result.error ? result.error.split(':')[0].substring(0, 60) : null,
      elapsed_ms: result.elapsed_ms ?? null,
      csrf_present: result.csrf_present ?? null,
      cookie_rotated: result.cookie_rotated ?? null,
      af_item_id: result.af_item_id ?? null,
    });
  } catch {
    // telemetry best-effort; never block the push
  }
}

export async function processAfPushJob(
  supabase: SupabaseClient,
  jobLotId: string,
  payload: { af_auction_id?: string },
  ctx: AfPushContext,
): Promise<{ success: boolean; found: boolean; error?: string; diag?: any }> {
  const afAuctionId = payload?.af_auction_id;
  if (!afAuctionId) {
    return { success: false, found: false, error: 'af_auction_id missing from payload' };
  }

  const { data: lot } = await supabase
    .from('lots')
    .select('*, lot_photos(*)')
    .eq('id', jobLotId)
    .is('deleted_at', null)
    .single();
  if (!lot) {
    return { success: false, found: false, error: 'Lot not found or deleted' };
  }
  if (lot.af_upload_status === 'uploaded') {
    return {
      success: true,
      found: true,
      diag: { skipped: 'already-uploaded', af_item_id: lot.af_item_id },
    };
  }

  let cookie = await getFreshCookie(supabase, afAuctionId, ctx);
  if (!cookie) {
    return { success: false, found: false, error: 'No AF session cookie stored' };
  }

  // Atomic claim — mark 'uploading' only if currently not in flight.
  const { data: claimed } = await supabase
    .from('lots')
    .update({ af_upload_status: 'uploading', af_upload_error: null })
    .eq('id', lot.id)
    .is('deleted_at', null)
    .or('af_upload_status.is.null,af_upload_status.eq.queued,af_upload_status.eq.failed')
    .select('id')
    .maybeSingle();
  if (!claimed) {
    return {
      success: false,
      found: false,
      error: 'Lot was claimed by another worker — refusing to double-send',
    };
  }

  const MAX_PHOTOS = 10;
  const photos = (lot.lot_photos || [])
    .slice()
    .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .slice(0, MAX_PHOTOS)
    .map((p: any) => ({
      url: supabase.storage.from('lot-photos').getPublicUrl(p.storage_path).data.publicUrl,
      storage_path: p.storage_path,
    }));

  let attemptNum = 1;
  let result = await uploadLotToAF(lot, photos, afAuctionId, cookie, 'next');
  await recordAttempt(supabase, lot.id, attemptNum, result);
  if (result.updated_cookie) {
    cookie = result.updated_cookie;
    ctx.cookiesByAfAuction.set(afAuctionId, cookie);
    ctx.cookieDirty = true;
  }

  // Idempotency: on uncertain outcome, check the admin item list
  // before deciding to retry. Same guard the per-request HQ Push uses.
  const isUncertain =
    !result.success &&
    (result.error?.includes('TIMEOUT_UNCERTAIN') || result.error?.startsWith('NETWORK_ERROR:'));
  if (isUncertain && lot.item_name) {
    try {
      const items = await fetchAdminItemList(afAuctionId, cookie);
      const needle = normalizeTitle(lot.item_name);
      const match = items.find((i) => normalizeTitle(i.title) === needle);
      if (match) {
        attemptNum++;
        result = {
          success: true,
          af_item_id: match.af_item_id,
          updated_cookie: cookie,
          http_status: result.http_status,
          elapsed_ms: result.elapsed_ms,
          csrf_present: result.csrf_present,
          cookie_rotated: result.cookie_rotated,
          debug: `recovered via admin item list after ${result.error}`,
        };
        await recordAttempt(supabase, lot.id, attemptNum, result);
      }
    } catch {
      // admin probe failed — fall through to normal retry logic
    }
  }

  // Transient retry: NETWORK_ERROR, 403 (CSRF rotation), 5xx, 429.
  // Up to 3 retries; backoff 1s/2s/4s (2× for 429).
  const isTransient = (err?: string) => {
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
    const base = result.error?.includes('429') ? 2000 : 1000;
    await new Promise((r) => setTimeout(r, base * Math.pow(2, attemptNum - 1)));
    attemptNum++;
    result = await uploadLotToAF(lot, photos, afAuctionId, cookie, 'next');
    await recordAttempt(supabase, lot.id, attemptNum, result);
    if (result.updated_cookie) {
      cookie = result.updated_cookie;
      ctx.cookiesByAfAuction.set(afAuctionId, cookie);
      ctx.cookieDirty = true;
    }
  }

  const isTimeoutResult = result.error?.includes('TIMEOUT_UNCERTAIN');
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

  // Persist the rotated cookie once per invocation batch — the
  // processor loop calls this helper after draining.
  if (ctx.cookieDirty) {
    await persistCookieIfRotated(supabase, cookie, new Date().toISOString());
    ctx.cookieDirty = false;
  }

  return {
    success: !!result.success,
    found: !!result.success,
    error: result.success ? undefined : result.error,
    diag: {
      attempts: attemptNum,
      af_item_id: result.af_item_id ?? null,
      http_status: result.http_status ?? null,
    },
  };
}
