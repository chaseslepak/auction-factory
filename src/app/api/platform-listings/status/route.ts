import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const auctionId = request.nextUrl.searchParams.get('auction_id');
  if (!auctionId) {
    return NextResponse.json({ error: 'auction_id required' }, { status: 400 });
  }

  // Fetch all platform listings for this auction with their items
  const { data: listings, error } = await supabase
    .from('platform_listings')
    .select('id, scraped_item_id, platform, cl_region, status, generated_title, posted_at, post_error')
    .eq('scraped_auction_id', auctionId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Compute summary counts per platform
  const summary: Record<string, Record<string, number>> = {};
  for (const listing of listings || []) {
    const key = listing.cl_region
      ? `${listing.platform}:${listing.cl_region}`
      : listing.platform;

    if (!summary[key]) {
      summary[key] = { draft: 0, content_ready: 0, posting: 0, posted: 0, failed: 0, manually_posted: 0, total: 0 };
    }
    summary[key][listing.status] = (summary[key][listing.status] || 0) + 1;
    summary[key].total++;
  }

  return NextResponse.json({ listings: listings || [], summary });
}
