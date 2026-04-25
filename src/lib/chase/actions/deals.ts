'use server';

import { revalidatePath } from 'next/cache';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser, isStaff } from '@/lib/chase/auth';
import { logActivity } from '@/lib/chase/activity';
import type { DealStage } from '@/lib/chase/types';

const STAGES: DealStage[] = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

export async function createDeal(formData: FormData) {
  const { user, profile } = await requireChaseUser();
  if (!isStaff(profile.role)) return { error: 'Not allowed' };
  const supabase = createChaseServerClient();

  const name = String(formData.get('name') || '').trim();
  if (!name) return { error: 'Name is required' };
  const company_id = (String(formData.get('company_id') || '') || null) as string | null;
  const dollars = parseFloat(String(formData.get('value_dollars') || '0'));
  const value_cents = Math.max(0, Math.round((isNaN(dollars) ? 0 : dollars) * 100));
  const stageRaw = String(formData.get('stage') || 'lead');
  const stage: DealStage = (STAGES as string[]).includes(stageRaw) ? (stageRaw as DealStage) : 'lead';
  const probability = Math.min(100, Math.max(0, parseInt(String(formData.get('probability') || '0'), 10) || 0));
  const expected_close = String(formData.get('expected_close_date') || '') || null;
  const notes = String(formData.get('notes') || '') || null;

  const { data, error } = await supabase
    .from('deals')
    .insert({
      name,
      company_id,
      value_cents,
      stage,
      probability,
      expected_close_date: expected_close,
      owner_id: user.id,
      notes,
    })
    .select('id')
    .single();
  if (error) return { error: error.message };
  await logActivity('deal.created', 'deal', data.id, { name });
  revalidatePath('/chase-os/deals');
  return { ok: true, id: data.id as string };
}

export async function setDealStage(id: string, stage: DealStage) {
  await requireChaseUser();
  const supabase = createChaseServerClient();
  const { error } = await supabase.from('deals').update({ stage }).eq('id', id);
  if (error) return { error: error.message };
  await logActivity('deal.stage_changed', 'deal', id, { stage });
  revalidatePath(`/chase-os/deals/${id}`);
  revalidatePath('/chase-os/deals');
  return { ok: true };
}
