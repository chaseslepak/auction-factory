'use server';

import { revalidatePath } from 'next/cache';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser, isAdmin } from '@/lib/chase/auth';
import { logActivity } from '@/lib/chase/activity';
import type { DecisionStatus } from '@/lib/chase/types';

export async function createDecision(formData: FormData) {
  const { profile } = await requireChaseUser();
  if (!isAdmin(profile.role) && profile.role !== 'team_member') {
    return { error: 'Not allowed' };
  }
  const supabase = createChaseServerClient();

  const title = String(formData.get('title') || '').trim();
  if (!title) return { error: 'Title is required' };
  const context = String(formData.get('context') || '') || null;
  const recommendation = String(formData.get('recommendation') || '') || null;
  const company_id = (String(formData.get('company_id') || '') || null) as string | null;
  const client_visible = formData.get('client_visible') === 'on';
  const due_date_raw = String(formData.get('due_date') || '');
  const due_date = due_date_raw ? new Date(due_date_raw).toISOString() : null;

  const optionsRaw = String(formData.get('options') || '').trim();
  let options: Array<{ option: string; pros?: string[]; cons?: string[] }> = [];
  if (optionsRaw) {
    options = optionsRaw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((option) => ({ option }));
  }

  const { data, error } = await supabase
    .from('decisions')
    .insert({
      title,
      context,
      recommendation,
      options,
      company_id,
      client_visible,
      due_date,
      decided_by: profile.id,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  await logActivity('decision.opened', 'decision', data.id, { title });
  revalidatePath('/chase-os/decisions');
  revalidatePath('/chase-os');
  return { ok: true, id: data.id as string };
}

export async function setDecisionStatus(id: string, status: DecisionStatus) {
  await requireChaseUser();
  const supabase = createChaseServerClient();
  const patch: Record<string, unknown> = { status };
  if (status === 'approved' || status === 'rejected') {
    patch.decided_at = new Date().toISOString();
  } else {
    patch.decided_at = null;
  }
  const { error } = await supabase.from('decisions').update(patch).eq('id', id);
  if (error) return { error: error.message };
  await logActivity(`decision.${status}`, 'decision', id, {});
  revalidatePath('/chase-os/decisions');
  revalidatePath(`/chase-os/decisions/${id}`);
  revalidatePath('/chase-os');
  return { ok: true };
}
