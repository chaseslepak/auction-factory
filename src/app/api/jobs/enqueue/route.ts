import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;

// Trigger the processor to start using waitUntil for reliability
async function triggerProcessor(request: NextRequest) {
  try {
    const origin = request.nextUrl.origin;
    const url = `${origin}/api/jobs/process`;

    try {
      const { waitUntil } = await import('@vercel/functions');
      waitUntil(
        fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }).catch(() => {})
      );
    } catch {
      // Fallback: fire-and-forget
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {});
      await new Promise((r) => setTimeout(r, 500));
    }
  } catch {}
}

export async function POST(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { auction_id, job_type = 'refresh_stock_images' } = await request.json();

  if (!auction_id) {
    return NextResponse.json({ error: 'auction_id required' }, { status: 400 });
  }

  // Get all eligible lots in this auction
  const { data: lots, error } = await supabase
    .from('lots')
    .select('id, brand, model')
    .eq('auction_id', auction_id)
    .limit(1000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Filter to lots that have a brand or model
  const candidates = (lots || []).filter((lot: any) => {
    const hasBrand = lot.brand && lot.brand !== 'Unknown' && lot.brand.trim() !== '';
    const hasModel = lot.model && lot.model !== 'Unknown' && lot.model.trim() !== '';
    return hasBrand || hasModel;
  });

  if (candidates.length === 0) {
    return NextResponse.json({
      enqueued: 0,
      message: `0 of ${lots?.length || 0} lots have a brand or model.`,
    });
  }

  // Delete ALL existing jobs for this auction so the new batch starts fresh
  // (otherwise old completed jobs show up in the progress count)
  await supabase
    .from('jobs')
    .delete()
    .eq('type', job_type)
    .eq('auction_id', auction_id);

  // Insert new jobs
  const jobsToInsert = candidates.map((lot: any) => ({
    type: job_type,
    status: 'pending',
    auction_id,
    lot_id: lot.id,
  }));

  const { error: insertError } = await supabase.from('jobs').insert(jobsToInsert);

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Trigger the processor to start
  await triggerProcessor(request);

  return NextResponse.json({
    enqueued: candidates.length,
    totalLots: lots?.length || 0,
    message: `Queued ${candidates.length} lots for processing in the background`,
  });
}
