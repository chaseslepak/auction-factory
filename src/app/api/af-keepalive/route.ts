import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

const AF_BASE = 'https://www.auctionfactory.com/admin';

export async function GET(request: NextRequest) {
  // Allow both authenticated users and Vercel cron (uses service role)
  const isCron = request.headers.get('authorization') === `Bearer ${process.env.CRON_SECRET}`;

  let sessionData: { session_cookie: string; updated_at: string } | null = null;

  if (isCron || process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Use service role client for cron jobs
    const serviceClient = createServiceClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await serviceClient
      .from('af_session')
      .select('session_cookie, updated_at')
      .eq('id', 1)
      .single();
    sessionData = data;
  }

  if (!sessionData) {
    // Fall back to user auth
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
    // Ping AF admin to keep session alive
    const res = await fetch(`${AF_BASE}/auctions.php`, {
      headers: { Cookie: session.session_cookie },
      redirect: 'manual',
    });

    const alive = res.status !== 302;

    if (alive) {
      // Update the timestamp using service role client
      const serviceClient = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
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
