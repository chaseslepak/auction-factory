'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createChaseServerClient } from '@/lib/chase/supabase/server';

export async function signInWithOtp(formData: FormData) {
  const email = String(formData.get('email') || '').trim().toLowerCase();
  if (!email) return { error: 'Email is required' };

  const supabase = createChaseServerClient();
  const origin = headers().get('origin') ?? '';
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/chase-os/auth/callback` },
  });
  if (error) return { error: error.message };
  return { ok: true };
}

export async function signOut() {
  const supabase = createChaseServerClient();
  await supabase.auth.signOut();
  redirect('/chase-os/login');
}
