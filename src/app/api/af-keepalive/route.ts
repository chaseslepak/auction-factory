import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const AF_BASE = 'https://auctionfactory.com/admin';

export async function GET(request: NextRequest) {
  // U1 FIX (2026-10-18): previously this endpoint short-circuited to the
  // service-role client whenever SUPABASE_SERVICE_ROLE_KEY was set in
  // env — which is ALWAYS true in production. That bypassed auth
  // entirely: any unauthenticated caller could probe AF session
  // liveness, bump updated_at to mask a stale session banner, and
  // drive AF-side rate limits on Chase's cookie.
  //
  // Now: require EITHER a valid Vercel cron bearer OR a resolved
  // authenticated user. Service role is still used to WRITE
  // updated_at inside the alive branch (user-scoped client may lack
  // write access to af_session depending on RLS).
  const isCron =
    !!process.env.CRON_SECRET &&
    request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;

  let sessionData: { session_cookie: string; updated_at: string } | null = null;

  if (isCron) {
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
    const { data } = await serviceClient
      .from('af_session')
      .select('session_cookie, updated_at')
      .eq('id', 1)
      .single();
    sessionData = data;
  } else {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { data } = await supabase
      .from('af_session')
      .select('session_cookie, updated_at')
      .eq('id', 1)
      .single();
    sessionData = data;
  }

  const session = sessionData;

  if (!session?.session_cookie) {
    return NextResponse.json({ alive: false, reason: 'no_session' });
  }

  try {
    let cookie = session.session_cookie;
    try {
      const { decrypt } = await import('@/lib/crypto');
      cookie = decrypt(cookie);
    } catch {}

    const res = await fetch(`${AF_BASE}/auctions.php`, {
      headers: { Cookie: cookie },
      redirect: 'manual',
    });

    const alive = res.status !== 302;

    if (alive) {
      const serviceClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
      );
      await serviceClient
        .from('af_session')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', 1);
    }

    return NextResponse.json({ alive, status: res.status });
  } catch (err: any) {
    return NextResponse.json({ alive: false, error: err.message });
  }
}
