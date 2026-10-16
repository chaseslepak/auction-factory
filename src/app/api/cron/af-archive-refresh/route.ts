import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { reindexArchive } from '@/lib/af-archive';

// Nightly top-of-list refresh: crawl the first page or two of
// past_auctions.php (24-48 most recent auctions) and index any new ones.
// Full historical crawls go through the admin UI (one-time job).
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  // Vercel cron auth, same pattern as /api/af-keepalive.
  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;
  if (!isCron && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'service role key missing' }, { status: 500 });
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const result = await reindexArchive(serviceClient, {
      fromPage: 0,
      pagesToProcess: 2,
      skipKnown: true,
      // Nightly only touches auctions not already crawled, so most
      // calls are near-no-op (page fetch + skip-decision). But a brand
      // new auction with 400 lots could still blow the budget — leave
      // the time guard to protect us.
      maxAuctions: 10,
      timeBudgetMs: 50_000,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'refresh failed' },
      { status: 500 }
    );
  }
}
