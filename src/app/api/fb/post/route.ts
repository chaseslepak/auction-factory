import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { postToFacebookPage } from '@/lib/facebook-page-poster';
import { decrypt } from '@/lib/crypto';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { listing_ids }: { listing_ids: string[] } = await request.json();
  if (!listing_ids?.length) {
    return NextResponse.json({ error: 'listing_ids required' }, { status: 400 });
  }

  // Get FB config
  const { data: config } = await supabase
    .from('platform_config')
    .select('config, enabled')
    .eq('platform', 'fb_page')
    .single();

  if (!config?.enabled || !config?.config?.page_id || !config?.config?.page_access_token) {
    return NextResponse.json(
      { error: 'Facebook page not configured or not enabled' },
      { status: 400 }
    );
  }

  let accessToken = config.config.page_access_token;
  try {
    accessToken = decrypt(accessToken);
  } catch {}

  const pageId = config.config.page_id;

  // Fetch the platform listings with their scraped item data
  const { data: listings, error: listingsErr } = await supabase
    .from('platform_listings')
    .select('*, af_scraped_items(*)')
    .in('id', listing_ids)
    .eq('platform', 'fb_page');

  if (listingsErr || !listings?.length) {
    return NextResponse.json(
      { error: `No FB page listings found: ${listingsErr?.message}` },
      { status: 404 }
    );
  }

  const results: { id: string; success: boolean; postId?: string; error?: string }[] = [];

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i];
    const item = listing.af_scraped_items;

    // Mark as posting
    await supabase
      .from('platform_listings')
      .update({ status: 'posting', updated_at: new Date().toISOString() })
      .eq('id', listing.id);

    try {
      const message = listing.generated_body || listing.generated_title || '';
      const photoUrls = item?.photos || [];

      const result = await postToFacebookPage(pageId, accessToken, message, photoUrls);

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
          .eq('id', listing.id);

        results.push({ id: listing.id, success: true, postId: result.postId });
      } else {
        await supabase
          .from('platform_listings')
          .update({
            status: 'failed',
            post_error: result.error,
            updated_at: now,
          })
          .eq('id', listing.id);

        results.push({ id: listing.id, success: false, error: result.error });
      }
    } catch (err: any) {
      await supabase
        .from('platform_listings')
        .update({
          status: 'failed',
          post_error: err.message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', listing.id);

      results.push({ id: listing.id, success: false, error: err.message });
    }

    // Rate limit between posts (2 seconds)
    if (i < listings.length - 1) {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  return NextResponse.json({
    results,
    succeeded: results.filter((r) => r.success).length,
    total: results.length,
  });
}
