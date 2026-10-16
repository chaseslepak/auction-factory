import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { reindexArchive } from '@/lib/af-archive';

// Scrape AF.com's public past-auctions pages and upsert into
// af_archive_items / af_archive_auctions. The admin UI drives this by
// calling it repeatedly with a cursor until next_page is null.
//
// Vercel's default serverless timeout is tight, so each call does a
// bounded chunk of work (default maxAuctions=5) and returns a cursor
// for the next call.
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  // Admin-only — gated by Supabase auth of an authenticated user.
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const fromPage = Math.max(0, Number(body.fromPage ?? 0));
  const pagesToProcess = Math.max(1, Math.min(10, Number(body.pagesToProcess ?? 1)));
  const skipKnown = body.skipKnown !== false; // default true
  // Default 3 (not 5) so a single call is far more likely to finish
  // inside the Vercel 60s function timeout even when auctions have
  // 400+ lots across 20+ page fetches.
  const maxAuctions = Math.max(1, Math.min(25, Number(body.maxAuctions ?? 3)));
  // Server-side wall-clock budget: return a cursor at 50s regardless of
  // where we are in processing. Vercel kills at 60s; 10s of headroom
  // keeps every call returning a usable response, never a 504.
  const timeBudgetMs = Math.max(5_000, Math.min(55_000, Number(body.timeBudgetMs ?? 50_000)));

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: 'SUPABASE_SERVICE_ROLE_KEY not configured — service-role write needed to upsert into af_archive_items.' },
      { status: 500 }
    );
  }

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const result = await reindexArchive(serviceClient, {
      fromPage,
      pagesToProcess,
      skipKnown,
      maxAuctions,
      timeBudgetMs,
    });
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'reindex failed' },
      { status: 500 }
    );
  }
}
