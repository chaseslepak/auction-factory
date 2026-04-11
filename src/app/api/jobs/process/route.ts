import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { processStockImageJob } from '@/lib/stock-image-processor';

export const maxDuration = 60;

// Process only N jobs per invocation to avoid timeouts
const MAX_JOBS_PER_INVOCATION = 1;

// This endpoint processes pending jobs from the queue.
// Can be called by:
// 1. The enqueue endpoint (to start processing)
// 2. Self-invocation (to chain more batches)
// 3. Vercel cron (as a fallback to resume stuck jobs)
// 4. Manually via the client
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const TIME_LIMIT = 50000; // 50 seconds max

  // Use service role client to bypass RLS
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }
  const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Anthropic API key not configured' }, { status: 500 });
  }
  const anthropic = new Anthropic({ apiKey });

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  try {
    // Also reset any stuck 'processing' jobs older than 2 minutes back to pending
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    await supabase
      .from('jobs')
      .update({ status: 'pending' })
      .eq('status', 'processing')
      .lt('started_at', twoMinutesAgo);

    // Process up to MAX_JOBS_PER_INVOCATION jobs per call
    while (processed < MAX_JOBS_PER_INVOCATION && Date.now() - startTime < TIME_LIMIT) {
      // Claim the next pending job
      const { data: pendingJobs } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'pending')
        .eq('type', 'refresh_stock_images')
        .order('created_at', { ascending: true })
        .limit(1);

      if (!pendingJobs || pendingJobs.length === 0) break;

      const job = pendingJobs[0];

      // Mark as processing
      const { data: claimed } = await supabase
        .from('jobs')
        .update({
          status: 'processing',
          started_at: new Date().toISOString(),
          attempts: (job.attempts || 0) + 1,
        })
        .eq('id', job.id)
        .eq('status', 'pending')
        .select()
        .single();

      if (!claimed) continue; // Someone else grabbed it

      try {
        const result = await processStockImageJob(supabase, anthropic, job.lot_id);

        await supabase
          .from('jobs')
          .update({
            status: result.success ? 'completed' : 'failed',
            error: result.error || null,
            result: { found: result.found },
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);

        if (result.success) succeeded++;
        else failed++;
      } catch (err: any) {
        await supabase
          .from('jobs')
          .update({
            status: 'failed',
            error: err?.message || 'Processing crashed',
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        failed++;
      }

      processed++;
    }

    // Check if there are more pending jobs
    const { count: pendingCount } = await supabase
      .from('jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .eq('type', 'refresh_stock_images');

    // Self-invoke to continue processing if there are more jobs
    if (pendingCount && pendingCount > 0) {
      const origin = request.nextUrl.origin;
      const secret = process.env.INTERNAL_JOB_SECRET || 'default-secret';
      // Use waitUntil from @vercel/functions to ensure the fetch actually runs
      try {
        const { waitUntil } = await import('@vercel/functions');
        waitUntil(
          fetch(`${origin}/api/jobs/process`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-internal-secret': secret,
            },
          }).catch(() => {})
        );
      } catch {
        // Fallback: fire a fetch without awaiting
        fetch(`${origin}/api/jobs/process`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': secret,
          },
        }).catch(() => {});
        await new Promise((r) => setTimeout(r, 200));
      }
    }

    return NextResponse.json({
      processed,
      succeeded,
      failed,
      pendingRemaining: pendingCount || 0,
      elapsed: Date.now() - startTime,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Processor crashed', processed, succeeded, failed },
      { status: 500 }
    );
  }
}
