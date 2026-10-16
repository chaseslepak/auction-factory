import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

// Lightweight polling endpoint for the HQ Push queue progress widget.
// Returns counts of af_push jobs for the auction, grouped by status.
// Called every ~2s while a push is active.
export async function GET(_: NextRequest, { params }: { params: { auctionId: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: jobs } = await supabase
    .from('jobs')
    .select('status, error, created_at, completed_at, lot_id')
    .eq('type', 'af_push')
    .eq('auction_id', params.auctionId)
    .limit(5000);

  const counts = { pending: 0, processing: 0, completed: 0, failed: 0 };
  const failed: Array<{ lot_id: string; error: string | null }> = [];
  let earliest: string | null = null;
  let latest: string | null = null;
  for (const j of jobs || []) {
    const s = j.status as keyof typeof counts;
    if (s in counts) counts[s]++;
    if (s === 'failed') {
      failed.push({ lot_id: j.lot_id as string, error: j.error as string | null });
    }
    if (!earliest || (j.created_at && j.created_at < earliest)) earliest = j.created_at as any;
    if (j.completed_at && (!latest || j.completed_at > latest)) latest = j.completed_at as any;
  }

  const total = counts.pending + counts.processing + counts.completed + counts.failed;
  const done = counts.completed + counts.failed;
  return NextResponse.json({
    counts,
    total,
    done,
    earliest,
    latest,
    failed: failed.slice(0, 50),
  });
}
