import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  // Require an authenticated session AND that the caller's email is on the
  // ALLOWED_EMAILS allowlist. This matches the gate used by middleware for
  // every other authenticated route.
  const userClient = createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const allowedEmails = (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (
    allowedEmails.length > 0 &&
    !allowedEmails.includes((user.email || '').toLowerCase())
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json({ error: 'Service key not configured' }, { status: 500 });
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json({ error: 'email and password required' }, { status: 400 });
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true, user_id: data.user?.id });
}
