import { NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// /api/jobs/process and /api/af-keepalive accept either Vercel cron (Bearer
// CRON_SECRET) or an authenticated user; their route handlers enforce that.
// /api/browser-upload/* are token-protected by the upload_tokens table.
// /api/admin-create-user requires an authenticated ALLOWED_EMAILS user; we
// keep it out of the middleware allowlist so middleware redirects unauth'd
// browser-form calls to /login as usual.
const PUBLIC_PATHS = ['/login', '/auth/callback', '/api/jobs/process', '/api/af-keepalive', '/api/browser-upload', '/manual', '/api/sop'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic =
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/favicon.ico';

  try {
    if (isPublic) {
      const { supabaseResponse } = await updateSession(request);
      return supabaseResponse;
    }

    const { user, supabaseResponse } = await updateSession(request);

    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      return NextResponse.redirect(url);
    }

    const allowedEmails = (process.env.ALLOWED_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (
      allowedEmails.length > 0 &&
      !allowedEmails.includes(user.email?.toLowerCase() || '')
    ) {
      const url = request.nextUrl.clone();
      url.pathname = '/login';
      url.searchParams.set('error', 'not_authorized');
      return NextResponse.redirect(url);
    }

    return supabaseResponse;
  } catch (e) {
    // If middleware crashes, redirect to login rather than 500
    console.error('Middleware error:', e);
    if (isPublic) {
      return NextResponse.next();
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
