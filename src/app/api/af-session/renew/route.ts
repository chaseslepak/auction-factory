import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { renewAfSession } from '@/lib/af-session-renewer';
import { encrypt } from '@/lib/crypto';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const MIN_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes between renewal attempts

// Programmatically re-establish the AF admin session using credentials
// stored in Vercel env (AF_LOGIN_EMAIL / AF_LOGIN_PASSWORD). On success,
// writes the new encrypted cookie to the af_session row and bumps
// last_renewed_at.
//
// Rate-limited: refuses a renewal attempt within 10 minutes of the last
// one to avoid tripping AF's account-lockout. Callers that want the
// freshest cookie should check updated_at before invoking.
//
// Accepts cron-secret bearer (for autonomous recovery) OR an
// authenticated user (for manual retry from /settings).
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization') || '';
  const isCronOrServer = !!cronSecret && authHeader === `Bearer ${cronSecret}`;

  if (!isCronOrServer) {
    const userClient = createClient();
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service role key not configured' }, { status: 500 });
  }
  const supabase = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey);

  // Rate-limit: look at the most recent renewal timestamp. Deliberately
  // DO NOT fall back to updated_at — that gets bumped on every PHPSESSID
  // rotation during a push, which would falsely block a legitimate
  // manual renewal attempt made right after a push. Null here means
  // "never renewed" → treat as renewable.
  const { data: existing } = await supabase
    .from('af_session')
    .select('last_renewed_at')
    .eq('id', 1)
    .maybeSingle();

  const lastRenewalIso = (existing as any)?.last_renewed_at || null;
  if (lastRenewalIso) {
    const age = Date.now() - new Date(lastRenewalIso).getTime();
    if (age < MIN_INTERVAL_MS) {
      return NextResponse.json(
        {
          renewed: false,
          error: `Last renewal was ${Math.round(age / 1000)}s ago — rate limit is ${MIN_INTERVAL_MS / 1000}s. Try again in ${Math.round((MIN_INTERVAL_MS - age) / 1000)}s.`,
        },
        { status: 429 }
      );
    }
  }

  const result = await renewAfSession();
  if (!result.success || !result.cookie) {
    return NextResponse.json(
      { renewed: false, error: result.error, diagnostic: result.diagnostic },
      { status: 500 }
    );
  }

  let stored = result.cookie;
  try {
    stored = encrypt(result.cookie);
  } catch {}

  const nowIso = new Date().toISOString();
  const upsertRow: any = {
    id: 1,
    session_cookie: stored,
    updated_at: nowIso,
  };
  // Set last_renewed_at only if the column exists (ignore error).
  const first = await supabase.from('af_session').upsert({
    ...upsertRow,
    last_renewed_at: nowIso,
  });
  if (first.error && /last_renewed_at/.test(first.error.message || '')) {
    // Column not migrated yet — upsert without it.
    await supabase.from('af_session').upsert(upsertRow);
  }

  return NextResponse.json({ renewed: true });
}
