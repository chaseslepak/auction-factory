import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { fetchAdminItemList, normalizeTitle } from '@/lib/af-admin-scraper';
import { decrypt } from '@/lib/crypto';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// One-time reconciliation sweep for pre-phase15 drift.
//
// Phase 15 added lots.af_item_id — the durable AF identity we now
// capture on every upload. Lots pushed before that shipped still have
// a lot_number but no af_item_id, so audit sync has to fall back to
// title+lot_number matching for them. That's exactly the matching that
// let the Oct 15 drift through.
//
// This endpoint walks each auction once, pulls AF's admin item list,
// and backfills af_item_id for any lot whose normalized title matches
// a unique admin row in the same auction. Lots that are ambiguous
// (duplicate titles, no match, multiple matches) are reported back —
// Chase decides each by hand.
//
// Safe to re-run: it only writes af_item_id where it's currently null
// and the match is unambiguous. Idempotent.
export async function POST(request: NextRequest) {
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }
  const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const { data: sessionRow } = await supabase
    .from('af_session')
    .select('session_cookie')
    .eq('id', 1)
    .single();
  if (!sessionRow?.session_cookie) {
    return NextResponse.json({ error: 'No AF session cookie stored. Set one in /settings first.' }, { status: 400 });
  }
  let cookie = sessionRow.session_cookie as string;
  try {
    cookie = decrypt(cookie);
  } catch {}

  // Find auctions that have an AF mapping — only those can be
  // backfilled. af_auction_id lives on af_auction_map, not auctions.
  const { data: mappings, error: mappingsErr } = await supabase
    .from('af_auction_map')
    .select('auction_id, af_auction_id, auctions(id, name)');
  if (mappingsErr) {
    return NextResponse.json({ error: mappingsErr.message }, { status: 500 });
  }
  const auctions = (mappings || []).map((m: any) => ({
    id: m.auction_id,
    af_auction_id: m.af_auction_id,
    title: m.auctions?.name ?? null,
  }));

  const perAuction: Array<{
    auction_id: string;
    af_auction_id: string;
    title: string | null;
    scanned: number;
    matched: number;
    ambiguous: number;
    unmatched: number;
    note?: string;
  }> = [];
  let totalMatched = 0;

  for (const a of auctions || []) {
    // Pull the lotter-side rows that still need af_item_id. The push
    // state lives on af_upload_status (not status) — only 'uploaded'
    // lots actually have an AF counterpart to match.
    const { data: lots } = await supabase
      .from('lots')
      .select('id, item_name, lot_number, af_item_id, af_upload_status')
      .eq('auction_id', a.id)
      .eq('af_upload_status', 'uploaded')
      .is('af_item_id', null);
    if (!lots || lots.length === 0) {
      perAuction.push({
        auction_id: a.id,
        af_auction_id: String(a.af_auction_id),
        title: a.title,
        scanned: 0,
        matched: 0,
        ambiguous: 0,
        unmatched: 0,
      });
      continue;
    }

    let admin;
    try {
      admin = await fetchAdminItemList(a.af_auction_id as any, cookie);
    } catch (err: any) {
      perAuction.push({
        auction_id: a.id,
        af_auction_id: String(a.af_auction_id),
        title: a.title,
        scanned: lots.length,
        matched: 0,
        ambiguous: 0,
        unmatched: 0,
        note: `AF scrape failed: ${err?.message || 'unknown'}`,
      });
      continue;
    }

    // Build a title → AdminItem[] index. Multiple admin rows with the
    // same normalized title get collected into the array; those become
    // "ambiguous" and we don't auto-backfill them.
    const byTitle = new Map<string, { af_item_id: number }[]>();
    for (const item of admin) {
      const key = normalizeTitle(item.title);
      if (!key) continue;
      const bucket = byTitle.get(key) || [];
      bucket.push({ af_item_id: item.af_item_id });
      byTitle.set(key, bucket);
    }

    let matched = 0;
    let ambiguous = 0;
    let unmatched = 0;
    for (const lot of lots) {
      const key = normalizeTitle(lot.item_name);
      if (!key) {
        unmatched++;
        continue;
      }
      const bucket = byTitle.get(key);
      if (!bucket || bucket.length === 0) {
        unmatched++;
        continue;
      }
      if (bucket.length > 1) {
        ambiguous++;
        continue;
      }
      const { error: upErr } = await supabase
        .from('lots')
        .update({ af_item_id: bucket[0].af_item_id })
        .eq('id', lot.id)
        .is('af_item_id', null);
      if (!upErr) {
        matched++;
        totalMatched++;
      }
    }

    perAuction.push({
      auction_id: a.id,
      af_auction_id: String(a.af_auction_id),
      title: a.title,
      scanned: lots.length,
      matched,
      ambiguous,
      unmatched,
    });
  }

  return NextResponse.json({
    totalMatched,
    auctions: perAuction.sort((a, b) => b.matched - a.matched),
  });
}
