import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

const CHASE_PUBLIC_PATHS = ['/chase-os/login', '/chase-os/auth/callback'];

export async function chaseUpdateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_CHASE_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_CHASE_SUPABASE_ANON_KEY || 'placeholder',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const isPublic = CHASE_PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (isPublic) {
      return supabaseResponse;
    }

    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/chase-os/login';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }

    const allowed = (process.env.CHASE_ALLOWED_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (
      allowed.length > 0 &&
      !allowed.includes(user.email?.toLowerCase() || '')
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/chase-os/login';
      url.searchParams.set('error', 'not_authorized');
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch (e) {
    console.error('Chase middleware error:', e);
    if (isPublic) return NextResponse.next();
    const url = request.nextUrl.clone();
    url.pathname = '/chase-os/login';
    return NextResponse.redirect(url);
  }
}
