'use server';

import { revalidatePath } from 'next/cache';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser } from '@/lib/chase/auth';

function toIntOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function toFloatOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

export async function logHealthEntry(formData: FormData) {
  const { user } = await requireChaseUser();
  const supabase = createChaseServerClient();

  const entry_date = String(formData.get('entry_date') || '') || new Date().toISOString().slice(0, 10);
  const energy = toIntOrNull(formData.get('energy'));
  const mood = toIntOrNull(formData.get('mood'));
  const sleep_hours = toFloatOrNull(formData.get('sleep_hours'));
  const notes = String(formData.get('notes') || '') || null;

  const { error } = await supabase
    .from('health_entries')
    .upsert(
      { profile_id: user.id, entry_date, energy, mood, sleep_hours, notes },
      { onConflict: 'profile_id,entry_date' },
    );
  if (error) return { error: error.message };
  revalidatePath('/chase-os/health');
  return { ok: true };
}
