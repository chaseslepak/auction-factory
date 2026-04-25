import { NextResponse } from 'next/server';
import { createChaseServerClient } from '@/lib/chase/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const redirectTo = url.searchParams.get('redirect') || '/chase-os';

  if (code) {
    const supabase = createChaseServerClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL(redirectTo, url.origin));
}
