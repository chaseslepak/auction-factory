import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { processStockImageJob } from '@/lib/stock-image-processor';
import { processDeepRescanJob } from '@/lib/deep-rescan-processor';

export const maxDuration = 60;

// Strict per-job time limit — if exceeded, mark as failed and move on
const PER_JOB_TIMEOUT_MS = 40000; // 40 seconds max per job
const TIME_BUDGET_MS = 45000; // Leave headroom before function timeout

// This endpoint processes pending jobs from the queue.
// Authentication: accepts either Vercel cron (Authorization: Bearer
// CRON_SECRET), server-to-server self-invocation with the same Bearer, or an
// authenticated user (so client polling / "kick the processor" calls work).
// Without one of those, returns 401 so the endpoint cannot be used as a free
// trigger for Anthropic API spend.
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  const isCronOrServer =
    !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCronOrServer) {
    // Fall back to user-session auth
    const userClient = createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

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

    // Process as many jobs as we can fit within the time budget
    while (Date.now() - startTime < TIME_BUDGET_MS) {
      // Claim the next pending job (any type)
      const { data: pendingJobs } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'pending')
        .in('type', ['refresh_stock_images', 'deep_rescan'])
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
        // Pick processor based on job type
        const processor =
          job.type === 'deep_rescan'
            ? processDeepRescanJob(supabase, anthropic, job.lot_id)
            : processStockImageJob(supabase, anthropic, job.lot_id);

        // Deep rescan gets a longer timeout (uses Opus)
        const jobTimeout = job.type === 'deep_rescan' ? 55000 : PER_JOB_TIMEOUT_MS;

        const result = await Promise.race([
          processor,
          new Promise<{ success: boolean; found: boolean; error?: string }>((resolve) =>
            setTimeout(
              () => resolve({ success: false, found: false, error: 'Per-job timeout' }),
              jobTimeout
            )
          ),
        ]);

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
      .in('type', ['refresh_stock_images', 'deep_rescan', 'generate_platform_content', 'post_fb_page']);

    // Self-invoke: await the fetch briefly to ensure it's dispatched
    // We don't wait for the full response, just long enough to guarantee
    // the HTTP request was sent before this function returns
    if (pendingCount && pendingCount > 0) {
      const origin = request.nextUrl.origin;
      const selfInvokeUrl = `${origin}/api/jobs/process`;

      try {
        // Try waitUntil first (preferred). Pass the CRON_SECRET so the auth
        // check in the target invocation accepts this server-to-server call.
        const selfInvokeHeaders: Record<string, string> = process.env.CRON_SECRET
          ? { Authorization: `Bearer ${process.env.CRON_SECRET}` }
          : {};
        const { waitUntil } = await import('@vercel/functions');
        waitUntil(
          fetch(selfInvokeUrl, { method: 'POST', headers: selfInvokeHeaders })
            .then(() => {})
            .catch(() => {})
        );
      } catch {
        // Fallback: race the fetch with a short timeout
        // The fetch gets dispatched to the network before the timeout hits
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 1500);
        const selfInvokeHeaders: Record<string, string> = process.env.CRON_SECRET
          ? { Authorization: `Bearer ${process.env.CRON_SECRET}` }
          : {};
        try {
          await fetch(selfInvokeUrl, {
            method: 'POST',
            headers: selfInvokeHeaders,
            signal: controller.signal,
          });
        } catch {
          // Aborted is expected — we just wanted to dispatch
        } finally {
          clearTimeout(timeoutId);
        }
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
