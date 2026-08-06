import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { PlatformType } from '@/lib/platform-types';

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const {
    scraped_auction_id,
    platforms,
    cl_regions,
  }: {
    scraped_auction_id: string;
    platforms: PlatformType[];
    cl_regions?: string[];
  } = await request.json();

  if (!scraped_auction_id || !platforms?.length) {
    return NextResponse.json(
      { error: 'scraped_auction_id and platforms required' },
      { status: 400 }
    );
  }

  // Fetch all scraped items for this auction
  const { data: items, error: itemsErr } = await supabase
    .from('af_scraped_items')
    .select('id')
    .eq('scraped_auction_id', scraped_auction_id);

  if (itemsErr || !items?.length) {
    return NextResponse.json(
      { error: `No items found: ${itemsErr?.message}` },
      { status: 404 }
    );
  }

  // Create one job per item for content generation
  const jobRows = items.map((item) => ({
    type: 'generate_platform_content',
    status: 'pending',
    auction_id: null,
    lot_id: null,
    payload: {
      scraped_item_id: item.id,
      scraped_auction_id,
      platforms,
      cl_regions,
    },
  }));

  const { error: insertErr } = await supabase.from('jobs').insert(jobRows);
  if (insertErr) {
    return NextResponse.json(
      { error: `Failed to enqueue jobs: ${insertErr.message}` },
      { status: 500 }
    );
  }

  // Trigger the job processor
  try {
    const origin = request.nextUrl.origin;
    fetch(`${origin}/api/jobs/process`, { method: 'POST' }).catch(() => {});
  } catch {}

  return NextResponse.json({
    enqueued: items.length,
    message: `Enqueued ${items.length} content generation jobs`,
  });
}
