import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { scrapeAuction } from '@/lib/af-scraper';

export const maxDuration = 60;

// GET /api/audit-auction/[id]
// Fetches the mapped AF auction via public scraper + all lots from the
// lotter, and returns a diff of what's present on each side.
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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

  const auctionId = params.id;

  const [{ data: auction }, { data: mapRow }, { data: lots }] = await Promise.all([
    supabase.from('auctions').select('id, name').eq('id', auctionId).single(),
    supabase
      .from('af_auction_map')
      .select('af_auction_id')
      .eq('auction_id', auctionId)
      .single(),
    supabase
      .from('lots')
      .select('lot_number, item_name, brand, model, af_upload_status')
      .eq('auction_id', auctionId)
      .is('deleted_at', null)
      .order('lot_number', { ascending: true }),
  ]);

  if (!auction) {
    return NextResponse.json({ error: 'Auction not found' }, { status: 404 });
  }
  if (!mapRow) {
    return NextResponse.json(
      {
        error:
          'This auction is not linked to an AF auction. Link it first via "Link AF Auction for Upload".',
      },
      { status: 400 }
    );
  }

  const afUrl = `https://www.auctionfactory.com/auction_details.php?auction=${mapRow.af_auction_id}`;

  let scraped;
  try {
    scraped = await scrapeAuction(afUrl, false);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to scrape AF: ${err?.message || String(err)}` },
      { status: 502 }
    );
  }

  type LotterRow = NonNullable<typeof lots>[number];
  const lotterByNumber = new Map<number, LotterRow>();
  (lots || []).forEach((l) => lotterByNumber.set(l.lot_number, l));

  // Group AF items by lot number to detect duplicates within AF itself
  const afByNumber = new Map<number, typeof scraped.items>();
  scraped.items.forEach((item) => {
    if (item.lot_number == null) return;
    const bucket = afByNumber.get(item.lot_number) || [];
    bucket.push(item);
    afByNumber.set(item.lot_number, bucket);
  });

  // Compute diffs
  const onlyInLotter: Array<{
    lot_number: number;
    item_name: string;
    af_upload_status: string | null;
  }> = [];
  const onlyInAf: Array<{ lot_number: number; title: string; af_item_url: string }> =
    [];
  const duplicatesInAf: Array<{ lot_number: number; count: number; titles: string[] }> =
    [];
  const numberCollisions: Array<{
    lot_number: number;
    lotter_item: string;
    af_titles: string[];
  }> = [];

  // Only-in-lotter
  lotterByNumber.forEach((lot, num) => {
    if (!afByNumber.has(num)) {
      onlyInLotter.push({
        lot_number: num,
        item_name: lot.item_name || '(no name)',
        af_upload_status: lot.af_upload_status,
      });
    }
  });

  // Only-in-AF and duplicates
  afByNumber.forEach((items, num) => {
    if (items.length > 1) {
      duplicatesInAf.push({
        lot_number: num,
        count: items.length,
        titles: items.map((i) => i.title).slice(0, 5),
      });
    }
    if (!lotterByNumber.has(num)) {
      onlyInAf.push({
        lot_number: num,
        title: items[0].title,
        af_item_url: items[0].af_item_url,
      });
    } else {
      // Both sides have the lot number — flag possible name mismatch
      const lotterItem = (lotterByNumber.get(num)!.item_name || '').toLowerCase();
      const afTitle = (items[0].title || '').toLowerCase();
      // Rough mismatch heuristic: neither side is empty AND no significant
      // overlap in words
      if (lotterItem && afTitle) {
        const lotterWords = new Set<string>(
          lotterItem.split(/\s+/).filter((w: string) => w.length > 3)
        );
        const afWords = new Set<string>(
          afTitle.split(/\s+/).filter((w: string) => w.length > 3)
        );
        let overlap = 0;
        lotterWords.forEach((w: string) => {
          if (afWords.has(w)) overlap++;
        });
        if (overlap === 0 && lotterWords.size > 0 && afWords.size > 0) {
          numberCollisions.push({
            lot_number: num,
            lotter_item: lotterByNumber.get(num)!.item_name || '(no name)',
            af_titles: items.map((i) => i.title).slice(0, 3),
          });
        }
      }
    }
  });

  onlyInLotter.sort((a, b) => a.lot_number - b.lot_number);
  onlyInAf.sort((a, b) => a.lot_number - b.lot_number);
  duplicatesInAf.sort((a, b) => a.lot_number - b.lot_number);
  numberCollisions.sort((a, b) => a.lot_number - b.lot_number);

  return NextResponse.json({
    auction_name: auction.name,
    af_auction_id: mapRow.af_auction_id,
    af_url: afUrl,
    counts: {
      lotter_lots: lots?.length || 0,
      af_lots: scraped.items.length,
    },
    only_in_lotter: onlyInLotter,
    only_in_af: onlyInAf,
    duplicates_in_af: duplicatesInAf,
    possible_name_mismatches: numberCollisions,
  });
}

// POST /api/audit-auction/[id]
// Re-runs the audit, then for every "only in lotter" lot number, resets its
// af_upload_status to null so the next Browser Upload picks it up.
// Body: { confirm: true } — must include to actually mutate.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const userClient = createClient();
  const {
    data: { user },
  } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  if (body?.confirm !== true) {
    return NextResponse.json(
      { error: 'Missing confirm: true in body' },
      { status: 400 }
    );
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

  const auctionId = params.id;

  const [{ data: mapRow }, { data: lots }] = await Promise.all([
    supabase
      .from('af_auction_map')
      .select('af_auction_id')
      .eq('auction_id', auctionId)
      .single(),
    supabase
      .from('lots')
      .select('lot_number')
      .eq('auction_id', auctionId)
      .is('deleted_at', null),
  ]);

  if (!mapRow) {
    return NextResponse.json(
      { error: 'This auction is not linked to an AF auction.' },
      { status: 400 }
    );
  }

  const afUrl = `https://www.auctionfactory.com/auction_details.php?auction=${mapRow.af_auction_id}`;
  let scraped;
  try {
    scraped = await scrapeAuction(afUrl, false);
  } catch (err: any) {
    return NextResponse.json(
      { error: `Failed to scrape AF: ${err?.message || String(err)}` },
      { status: 502 }
    );
  }

  const afNumbers = new Set<number>();
  scraped.items.forEach((it) => {
    if (it.lot_number != null) afNumbers.add(it.lot_number);
  });

  const toReset = (lots || [])
    .map((l) => l.lot_number)
    .filter((n) => !afNumbers.has(n));

  if (toReset.length === 0) {
    return NextResponse.json({ reset_count: 0, lot_numbers: [] });
  }

  const { error: updateError } = await supabase
    .from('lots')
    .update({ af_upload_status: null, af_upload_error: null })
    .eq('auction_id', auctionId)
    .in('lot_number', toReset)
    .is('deleted_at', null);

  if (updateError) {
    return NextResponse.json(
      { error: `Update failed: ${updateError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    reset_count: toReset.length,
    lot_numbers: toReset.sort((a, b) => a - b),
  });
}
