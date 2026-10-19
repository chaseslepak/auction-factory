import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { computeListedPrice, syncRetailLine, formatLotTitle } from '@/lib/listing-price';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// One-shot pricing resync for an entire auction. Re-applies
// formatLotTitle (title suffix "($N)"), syncRetailLine (description
// "Retail Price: $N" line), and computeListedPrice to every lot using
// the current estimated_retail_new as the source of truth.
//
// Use this after the Pricing PR lands, to retroactively bring an
// auction's lots in line with the raw-mean-price convention (no
// markup, all three references match).
//
// POST /api/admin/resync-pricing/<auction-id>
//   { "confirm": true, "dry_run"?: boolean }
//
// Returns per-lot before/after so you can inspect what changed.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const userClient = createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (body?.confirm !== true) {
    return NextResponse.json(
      {
        error:
          'Missing { confirm: true } in body. This rewrites the title and description of EVERY lot in the auction. Pass dry_run: true to preview without writing.',
      },
      { status: 400 },
    );
  }
  const dryRun = body?.dry_run === true;

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: 'Service role key not configured' },
      { status: 500 },
    );
  }
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
  );

  const { data: lots, error } = await supabase
    .from('lots')
    .select('id, lot_number, item_name, auction_description, condition_rating, estimated_retail_new, listed_price')
    .eq('auction_id', params.id)
    .is('deleted_at', null)
    .order('lot_number', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: `Fetch lots failed: ${error.message}` },
      { status: 500 },
    );
  }
  if (!lots || lots.length === 0) {
    return NextResponse.json(
      { error: 'No lots found for this auction' },
      { status: 404 },
    );
  }

  const changes: Array<{
    lot_id: string;
    lot_number: number | null;
    title_changed: boolean;
    description_changed: boolean;
    listed_price_changed: boolean;
    before: { title: string | null; listed_price: number | null };
    after: { title: string; listed_price: number };
  }> = [];
  let updated = 0;
  let unchanged = 0;
  let skippedNoRetail = 0;

  for (const lot of lots as any[]) {
    const retail = Number(lot.estimated_retail_new) || 0;
    if (retail <= 0) {
      // No retail price captured — can't resync. Leave as is.
      skippedNoRetail++;
      continue;
    }
    const newListed = computeListedPrice(retail);
    const baseName = lot.item_name || '';
    const newTitle = baseName ? formatLotTitle(baseName, lot.condition_rating, newListed) : baseName;
    const newDesc = lot.auction_description
      ? syncRetailLine(lot.auction_description, newListed)
      : lot.auction_description;

    const titleChanged = newTitle !== lot.item_name;
    const descChanged = newDesc !== lot.auction_description;
    const priceChanged = Number(lot.listed_price) !== newListed;

    if (!titleChanged && !descChanged && !priceChanged) {
      unchanged++;
      continue;
    }

    changes.push({
      lot_id: lot.id,
      lot_number: lot.lot_number,
      title_changed: titleChanged,
      description_changed: descChanged,
      listed_price_changed: priceChanged,
      before: { title: lot.item_name, listed_price: lot.listed_price },
      after: { title: newTitle, listed_price: newListed },
    });

    if (!dryRun) {
      const updates: any = { listed_price: newListed };
      if (titleChanged) updates.item_name = newTitle;
      if (descChanged) updates.auction_description = newDesc;
      const { error: updErr } = await supabase
        .from('lots')
        .update(updates)
        .eq('id', lot.id);
      if (updErr) {
        console.error(`resync-pricing: update failed for lot ${lot.id}:`, updErr);
        continue;
      }
      updated++;
    } else {
      updated++;
    }
  }

  return NextResponse.json({
    auction_id: params.id,
    dry_run: dryRun,
    total_lots: lots.length,
    updated,
    unchanged,
    skipped_no_retail: skippedNoRetail,
    // First 20 changes so Chase can eyeball the diff.
    sample_changes: changes.slice(0, 20),
    note: dryRun
      ? 'Dry run — nothing was written. Re-POST with { "confirm": true } (no dry_run) to apply.'
      : 'Lots in the lotter updated. These changes affect future HQ Pushes; items already on AF stay as-is until re-pushed.',
  });
}
