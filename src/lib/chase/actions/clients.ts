'use server';

import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser, isAdmin } from '@/lib/chase/auth';
import { logActivity } from '@/lib/chase/activity';

export async function createClientInvite(formData: FormData) {
  const { user, profile } = await requireChaseUser();
  if (!isAdmin(profile.role)) return { error: 'Not allowed' };
  const supabase = createChaseServerClient();

  const email = String(formData.get('email') || '').trim().toLowerCase();
  const company_id = String(formData.get('company_id') || '') || null;
  if (!email) return { error: 'Email is required' };
  if (!company_id) return { error: 'Company is required' };

  const token = randomBytes(24).toString('hex');

  const { data, error } = await supabase
    .from('client_portal_invites')
    .insert({ email, company_id, invited_by: user.id, token })
    .select('id')
    .single();
  if (error) return { error: error.message };
  await logActivity('client.invited', 'invite', data.id, { email });
  revalidatePath('/chase-os/clients');
  return { ok: true };
}

export async function acceptClientInvite(id: string) {
  const { profile } = await requireChaseUser();
  if (!isAdmin(profile.role)) return { error: 'Not allowed' };
  const supabase = createChaseServerClient();
  const { error } = await supabase
    .from('client_portal_invites')
    .update({ accepted_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };
  await logActivity('client.activated', 'invite', id, {});
  revalidatePath('/chase-os/clients');
  return { ok: true };
}
