import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import { generatePlatformContent } from '@/lib/platform-content-generator';
import { logApiUsage } from '@/lib/api-usage';
import type { PlatformType, ScrapedItem } from '@/lib/platform-types';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
  }

  const {
    scraped_auction_id,
    scraped_item_ids,
    platforms,
    cl_regions,
  }: {
    scraped_auction_id: string;
    scraped_item_ids: string[] | 'all';
    platforms: PlatformType[];
    cl_regions?: string[];
  } = await request.json();

  if (!scraped_auction_id || !scraped_item_ids || !platforms?.length) {
    return NextResponse.json(
      { error: 'scraped_auction_id, scraped_item_ids, and platforms are required' },
      { status: 400 }
    );
  }

  // Fetch the auction name
  const { data: auction } = await supabase
    .from('af_scraped_auctions')
    .select('af_name')
    .eq('id', scraped_auction_id)
    .single();

  const auctionName = auction?.af_name || 'Auction';

  // Fetch the scraped items (all or specific IDs)
  let itemsQuery = supabase
    .from('af_scraped_items')
    .select('*')
    .eq('scraped_auction_id', scraped_auction_id);

  if (scraped_item_ids !== 'all') {
    itemsQuery = itemsQuery.in('id', scraped_item_ids);
  }

  const { data: items, error: itemsErr } = await itemsQuery;

  if (itemsErr || !items?.length) {
    return NextResponse.json(
      { error: `No items found: ${itemsErr?.message || 'empty result'}` },
      { status: 404 }
    );
  }

  const anthropic = new Anthropic({ apiKey });
  const results: { item_id: string; success: boolean; error?: string }[] = [];

  for (const item of items) {
    try {
      const scrapedItem: ScrapedItem = {
        id: item.id,
        scraped_auction_id: item.scraped_auction_id,
        af_item_url: item.af_item_url,
        lot_number: item.lot_number,
        title: item.title,
        description: item.description,
        photos: item.photos || [],
        price: item.price,
        condition: item.condition,
        brand: item.brand,
        model: item.model,
        dimensions: item.dimensions,
        scraped_at: item.scraped_at,
        current_bid: item.price,
      };

      const content = await generatePlatformContent(
        anthropic,
        scrapedItem,
        platforms,
        auctionName,
      );

      // Upsert platform_listings for each platform
      const now = new Date().toISOString();

      if (content.craigslist) {
        const regions = cl_regions?.length ? cl_regions : ['cleveland'];
        for (const region of regions) {
          await supabase.from('platform_listings').upsert(
            {
              scraped_item_id: item.id,
              scraped_auction_id,
              platform: 'craigslist' as const,
              cl_region: region,
              generated_title: content.craigslist.title,
              generated_body: content.craigslist.body,
              generated_data: content.craigslist,
              generated_at: now,
              status: 'content_ready',
              updated_at: now,
            },
            { onConflict: 'scraped_item_id,platform,cl_region', ignoreDuplicates: false }
          );
        }
      }

      if (content.fb_marketplace) {
        await supabase.from('platform_listings').upsert(
          {
            scraped_item_id: item.id,
            scraped_auction_id,
            platform: 'fb_marketplace' as const,
            cl_region: null,
            generated_title: content.fb_marketplace.title,
            generated_body: content.fb_marketplace.description,
            generated_data: content.fb_marketplace,
            generated_at: now,
            status: 'content_ready',
            updated_at: now,
          },
          { onConflict: 'scraped_item_id,platform,cl_region', ignoreDuplicates: false }
        );
      }

      if (content.fb_page) {
        const fullPost = content.fb_page.post_text +
          '\n\n' +
          content.fb_page.hashtags.map((h) => `#${h}`).join(' ');

        await supabase.from('platform_listings').upsert(
          {
            scraped_item_id: item.id,
            scraped_auction_id,
            platform: 'fb_page' as const,
            cl_region: null,
            generated_title: item.title,
            generated_body: fullPost,
            generated_data: content.fb_page,
            generated_at: now,
            status: 'content_ready',
            updated_at: now,
          },
          { onConflict: 'scraped_item_id,platform,cl_region', ignoreDuplicates: false }
        );
      }

      results.push({ item_id: item.id, success: true });
    } catch (err: any) {
      results.push({ item_id: item.id, success: false, error: err.message });
    }
  }

  // Log API usage (approximate - one call per item)
  try {
    await logApiUsage(supabase, {
      service: 'anthropic',
      operation: 'generate_platform_content',
      model: 'claude-sonnet-4-6',
      input_tokens: items.length * 2000,
      output_tokens: items.length * 800,
    });
  } catch {}

  const succeeded = results.filter((r) => r.success).length;
  return NextResponse.json({ results, succeeded, total: items.length });
}
