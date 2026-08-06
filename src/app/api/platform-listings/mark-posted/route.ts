import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { listing_ids, external_urls } = await request.json();
  if (!listing_ids?.length) {
    return NextResponse.json({ error: 'listing_ids required' }, { status: 400 });
  }

  const now = new Date().toISOString();
  let updated = 0;

  for (let i = 0; i < listing_ids.length; i++) {
    const { error } = await supabase
      .from('platform_listings')
      .update({
        status: 'manually_posted',
        external_url: external_urls?.[i] || null,
        posted_at: now,
        updated_at: now,
      })
      .eq('id', listing_ids[i]);

    if (!error) updated++;
  }

  return NextResponse.json({ updated, total: listing_ids.length });
}
