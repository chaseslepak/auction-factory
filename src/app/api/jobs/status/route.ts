import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const auction_id = request.nextUrl.searchParams.get('auction_id');
  const job_type = request.nextUrl.searchParams.get('type') || 'refresh_stock_images';

  if (!auction_id) {
    return NextResponse.json({ error: 'auction_id required' }, { status: 400 });
  }

  // Count jobs by status
  const { data: jobs } = await supabase
    .from('jobs')
    .select('status, result, error')
    .eq('auction_id', auction_id)
    .eq('type', job_type);

  if (!jobs || jobs.length === 0) {
    return NextResponse.json({
      active: false,
      total: 0,
      pending: 0,
      processing: 0,
      completed: 0,
      failed: 0,
      found: 0,
    });
  }

  const counts = {
    total: jobs.length,
    pending: jobs.filter((j) => j.status === 'pending').length,
    processing: jobs.filter((j) => j.status === 'processing').length,
    completed: jobs.filter((j) => j.status === 'completed').length,
    failed: jobs.filter((j) => j.status === 'failed').length,
    found: jobs.filter((j) => j.status === 'completed' && (j.result as any)?.found).length,
  };

  const active = counts.pending + counts.processing > 0;

  return NextResponse.json({
    active,
    ...counts,
  });
}

// DELETE: clear completed jobs for an auction
export async function DELETE(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const auction_id = request.nextUrl.searchParams.get('auction_id');
  if (!auction_id) {
    return NextResponse.json({ error: 'auction_id required' }, { status: 400 });
  }

  await supabase
    .from('jobs')
    .delete()
    .eq('auction_id', auction_id)
    .in('status', ['completed', 'failed']);

  return NextResponse.json({ success: true });
}
