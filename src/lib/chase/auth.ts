import { redirect } from 'next/navigation';
import { createChaseServerClient } from './supabase/server';
import type { ChaseRole, Profile } from './types';

export async function requireChaseUser() {
  const supabase = createChaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/chase-os/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>();

  if (!profile) {
    // Trigger normally creates this; fall back if missing.
    redirect('/chase-os/login?error=no_profile');
  }

  return { user, profile };
}

export async function getChaseUserOptional() {
  const supabase = createChaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>();
  return profile ? { user, profile } : null;
}

export function canEditTask(role: ChaseRole, isAuthor: boolean, isAssignee: boolean) {
  if (role === 'owner' || role === 'admin') return true;
  if (role === 'team_member') return isAuthor || isAssignee;
  return false;
}

export function isStaff(role: ChaseRole) {
  return role === 'owner' || role === 'admin' || role === 'team_member';
}

export function isAdmin(role: ChaseRole) {
  return role === 'owner' || role === 'admin';
}
