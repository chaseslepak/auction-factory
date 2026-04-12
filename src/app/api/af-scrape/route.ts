import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scrapeAuction, scrapeAuctionList } from '@/lib/af-scraper';

export const maxDuration = 60;

// GET: list active auctions from AF homepage
export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const auctions = await scrapeAuctionList();
    return NextResponse.json({ auctions });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// POST: scrape all items from a specific auction
export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { auction_url, fetch_details } = await request.json();
  if (!auction_url) {
    return NextResponse.json(
      { error: 'auction_url is required' },
      { status: 400 }
    );
  }

  try {
    const result = await scrapeAuction(auction_url, fetch_details || false);

    // Upsert scraped auction record
    const { data: auctionRecord, error: auctionErr } = await supabase
      .from('af_scraped_auctions')
      .upsert(
        {
          af_url: result.af_url,
          af_name: result.af_name,
          item_count: result.items.length,
          scraped_at: new Date().toISOString(),
        },
        { onConflict: 'af_url' }
      )
      .select()
      .single();

    if (auctionErr || !auctionRecord) {
      return NextResponse.json(
        { error: `Failed to save auction: ${auctionErr?.message}` },
        { status: 500 }
      );
    }

    // Delete old scraped items for this auction (fresh scrape)
    await supabase
      .from('af_scraped_items')
      .delete()
      .eq('scraped_auction_id', auctionRecord.id);

    // Insert scraped items
    if (result.items.length > 0) {
      const itemRows = result.items.map((item) => ({
        scraped_auction_id: auctionRecord.id,
        af_item_url: item.af_item_url,
        lot_number: item.lot_number,
        title: item.title,
        description: item.description,
        photos: item.photos,
        price: item.current_bid,
        condition: item.condition,
        brand: item.brand,
        model: item.model,
        dimensions: item.dimensions,
      }));

      const { error: itemsErr } = await supabase
        .from('af_scraped_items')
        .insert(itemRows);

      if (itemsErr) {
        return NextResponse.json(
          { error: `Failed to save items: ${itemsErr.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      auction_id: auctionRecord.id,
      auction_name: result.af_name,
      item_count: result.items.length,
      items: result.items,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
