import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

// Queue-based HQ Push.
//
// Enqueues one af_push job per lot. The worker (/api/jobs/process)
// drains them, calling uploadLotToAF directly for each. Replaces the
// client-side iteration loop so:
//
//   - Chase can close the tab mid-push; the queue keeps draining.
//   - Progress is live via supabase realtime on the jobs table.
//   - Transient failures retry at the job level, not the batch level.
//   - A 60s Vercel function limit no longer caps auction size.
//
// Idempotent: re-enqueueing an auction clears old af_push jobs for
// that auction first, so the progress widget reflects the current run.
async function triggerProcessor(request: NextRequest) {
  try {
    const url = `${request.nextUrl.origin}/api/jobs/process`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.CRON_SECRET) {
      headers.Authorization = `Bearer ${process.env.CRON_SECRET}`;
    }
    try {
      const { waitUntil } = await import('@vercel/functions');
      waitUntil(fetch(url, { method: 'POST', headers }).catch(() => {}));
    } catch {
      fetch(url, { method: 'POST', headers }).catch(() => {});
      await new Promise((r) => setTimeout(r, 300));
    }
  } catch {}
}

export async function POST(request: NextRequest) {
  const userClient = createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { auction_id, lot_ids } = await request.json();
  if (!auction_id || !Array.isArray(lot_ids) || lot_ids.length === 0) {
    return NextResponse.json({ error: 'auction_id and lot_ids[] required' }, { status: 400 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = serviceKey
    ? createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey)
    : userClient;

  // Verify auction has an AF mapping — nothing to push to otherwise.
  const { data: mapping } = await supabase
    .from('auctions')
    .select('af_auction_id')
    .eq('id', auction_id)
    .single();
  if (!mapping?.af_auction_id) {
    return NextResponse.json(
      { error: 'No AF auction linked. Link one at /settings or the auction page first.' },
      { status: 400 },
    );
  }

  // Only enqueue lots that are actually push-ready. Match the same gate
  // the sync-loop route uses so the UI counts stay honest.
  const { data: lots } = await supabase
    .from('lots')
    .select('id, lot_number, af_upload_status')
    .in('id', lot_ids)
    .is('deleted_at', null)
    .order('lot_number', { ascending: true });

  const eligible = (lots || []).filter(
    (l: any) => l.af_upload_status !== 'uploaded' && l.af_upload_status !== 'uploading',
  );
  if (eligible.length === 0) {
    return NextResponse.json({
      enqueued: 0,
      message: 'No eligible lots — all already uploaded or in flight.',
    });
  }

  // Clear old af_push jobs for THESE lots only so a re-queue of a
  // subset doesn't wipe the progress of a parallel full-push.
  await supabase
    .from('jobs')
    .delete()
    .eq('type', 'af_push')
    .in('lot_id', eligible.map((l: any) => l.id));

  const rows = eligible.map((l: any) => ({
    type: 'af_push',
    status: 'pending',
    auction_id,
    lot_id: l.id,
    payload: { af_auction_id: mapping.af_auction_id, lot_number: l.lot_number },
  }));

  const { error: insErr } = await supabase.from('jobs').insert(rows);
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  await triggerProcessor(request);

  return NextResponse.json({
    enqueued: rows.length,
    message: `Queued ${rows.length} lots. You can close this tab — the worker will keep pushing in the background.`,
  });
}
