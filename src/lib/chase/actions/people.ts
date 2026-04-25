'use server';

import { revalidatePath } from 'next/cache';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser, isStaff } from '@/lib/chase/auth';
import { logActivity } from '@/lib/chase/activity';

export async function createPerson(formData: FormData) {
  const { user, profile } = await requireChaseUser();
  if (!isStaff(profile.role)) return { error: 'Not allowed' };
  const supabase = createChaseServerClient();

  const full_name = String(formData.get('full_name') || '').trim();
  if (!full_name) return { error: 'Name is required' };
  const email = String(formData.get('email') || '') || null;
  const phone = String(formData.get('phone') || '') || null;
  const role_title = String(formData.get('role_title') || '') || null;
  const company_id = (String(formData.get('company_id') || '') || null) as string | null;
  const notes = String(formData.get('notes') || '') || null;

  const { data, error } = await supabase
    .from('people')
    .insert({ full_name, email, phone, role_title, company_id, notes, owner_id: user.id })
    .select('id')
    .single();
  if (error) return { error: error.message };
  await logActivity('person.created', 'person', data.id, { full_name });
  revalidatePath('/chase-os/people');
  return { ok: true, id: data.id as string };
}

export async function updatePerson(id: string, formData: FormData) {
  await requireChaseUser();
  const supabase = createChaseServerClient();
  const patch: Record<string, unknown> = {};
  for (const k of ['full_name', 'email', 'phone', 'role_title', 'notes', 'company_id'] as const) {
    const v = formData.get(k);
    if (v !== null) patch[k] = String(v) || null;
  }
  const { error } = await supabase.from('people').update(patch).eq('id', id);
  if (error) return { error: error.message };
  await logActivity('person.updated', 'person', id, {});
  revalidatePath(`/chase-os/people/${id}`);
  revalidatePath('/chase-os/people');
  return { ok: true };
}
