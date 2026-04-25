'use server';

import { revalidatePath } from 'next/cache';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser } from '@/lib/chase/auth';
import { logActivity } from '@/lib/chase/activity';

export async function createCompany(formData: FormData) {
  const { user } = await requireChaseUser();
  const supabase = createChaseServerClient();

  const name = String(formData.get('name') || '').trim();
  if (!name) return { error: 'Name is required' };
  const domain = String(formData.get('domain') || '') || null;
  const industry = String(formData.get('industry') || '') || null;
  const notes = String(formData.get('notes') || '') || null;

  const { data, error } = await supabase
    .from('companies')
    .insert({ name, domain, industry, notes, owner_id: user.id, status: 'active' })
    .select('id')
    .single();

  if (error) return { error: error.message };
  await logActivity('company.created', 'company', data.id, { name });
  revalidatePath('/chase-os/companies');
  return { ok: true, id: data.id as string };
}

export async function updateCompany(id: string, formData: FormData) {
  await requireChaseUser();
  const supabase = createChaseServerClient();
  const patch: Record<string, unknown> = {};
  for (const k of ['name', 'domain', 'industry', 'status', 'notes'] as const) {
    const v = formData.get(k);
    if (v !== null) patch[k] = String(v);
  }
  const { error } = await supabase.from('companies').update(patch).eq('id', id);
  if (error) return { error: error.message };
  await logActivity('company.updated', 'company', id, {});
  revalidatePath(`/chase-os/companies/${id}`);
  revalidatePath('/chase-os/companies');
  return { ok: true };
}
