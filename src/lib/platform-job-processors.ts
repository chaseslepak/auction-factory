// Job processors for platform content generation and FB page posting

import type { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { generatePlatformContent } from './platform-content-generator';
import { postToFacebookPage } from './facebook-page-poster';
import { decrypt } from './crypto';
import type { PlatformType, ScrapedItem } from './platform-types';

interface JobResult {
  success: boolean;
  found: boolean;
  error?: string;
}

// Process a generate_platform_content job
// job.payload should contain: { scraped_item_id, scraped_auction_id, platforms, cl_regions? }
export async function processPlatformContentJob(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  job: any
): Promise<JobResult> {
  const payload = job.payload || {};
  const { scraped_item_id, scraped_auction_id, platforms, cl_regions } = payload;

  if (!scraped_item_id || !platforms?.length) {
    return { success: false, found: false, error: 'Missing scraped_item_id or platforms in payload' };
  }

  // Fetch the item
  const { data: item, error: itemErr } = await supabase
    .from('af_scraped_items')
    .select('*')
    .eq('id', scraped_item_id)
    .single();

  if (itemErr || !item) {
    return { success: false, found: false, error: `Item not found: ${itemErr?.message}` };
  }

  // Fetch auction name
  const { data: auction } = await supabase
    .from('af_scraped_auctions')
    .select('af_name')
    .eq('id', scraped_auction_id)
    .single();

  const scrapedItem: ScrapedItem = {
    id: item.id,
    scraped_auction_id: item.scraped_auction_id,
    af_item_url: item.af_item_url,
    lot_number: item.lot_number,
    title: item.title,
    description: item.description,
    photos: item.photos || [],
    price: item.price,
    current_bid: item.price,
    condition: item.condition,
    brand: item.brand,
    model: item.model,
    dimensions: item.dimensions,
    scraped_at: item.scraped_at,
  };

  const content = await generatePlatformContent(
    anthropic,
    scrapedItem,
    platforms as PlatformType[],
    auction?.af_name || 'Auction',
  );

  const now = new Date().toISOString();

  if (content.craigslist) {
    const regions = cl_regions?.length ? cl_regions : ['cleveland'];
    for (const region of regions) {
      await supabase.from('platform_listings').upsert(
        {
          scraped_item_id: item.id,
          scraped_auction_id,
          platform: 'craigslist',
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
        platform: 'fb_marketplace',
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
      content.fb_page.hashtags.map((h: string) => `#${h}`).join(' ');

    await supabase.from('platform_listings').upsert(
      {
        scraped_item_id: item.id,
        scraped_auction_id,
        platform: 'fb_page',
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

  return { success: true, found: true };
}

// Process a post_fb_page job
// job.payload should contain: { listing_id }
export async function processFbPagePostJob(
  supabase: SupabaseClient,
  job: any
): Promise<JobResult> {
  const { listing_id } = job.payload || {};

  if (!listing_id) {
    return { success: false, found: false, error: 'Missing listing_id in payload' };
  }

  // Get the listing with item data
  const { data: listing, error: listingErr } = await supabase
    .from('platform_listings')
    .select('*, af_scraped_items(*)')
    .eq('id', listing_id)
    .eq('platform', 'fb_page')
    .single();

  if (listingErr || !listing) {
    return { success: false, found: false, error: `Listing not found: ${listingErr?.message}` };
  }

  // Get FB config
  const { data: config } = await supabase
    .from('platform_config')
    .select('config, enabled')
    .eq('platform', 'fb_page')
    .single();

  if (!config?.enabled || !config?.config?.page_id || !config?.config?.page_access_token) {
    return { success: false, found: true, error: 'Facebook page not configured or not enabled' };
  }

  let accessToken = config.config.page_access_token;
  try { accessToken = decrypt(accessToken); } catch {}

  // Mark as posting
  await supabase
    .from('platform_listings')
    .update({ status: 'posting', updated_at: new Date().toISOString() })
    .eq('id', listing_id);

  const message = listing.generated_body || '';
  const photoUrls = listing.af_scraped_items?.photos || [];

  const result = await postToFacebookPage(config.config.page_id, accessToken, message, photoUrls);

  const now = new Date().toISOString();
  if (result.success) {
    await supabase
      .from('platform_listings')
      .update({
        status: 'posted',
        external_id: result.postId,
        external_url: result.permalink,
        posted_at: now,
        post_error: null,
        updated_at: now,
      })
      .eq('id', listing_id);
    return { success: true, found: true };
  } else {
    await supabase
      .from('platform_listings')
      .update({
        status: 'failed',
        post_error: result.error,
        updated_at: now,
      })
      .eq('id', listing_id);
    return { success: false, found: true, error: result.error };
  }
}
