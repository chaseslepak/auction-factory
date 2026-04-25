'use server';

import { revalidatePath } from 'next/cache';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser } from '@/lib/chase/auth';
import { logActivity } from '@/lib/chase/activity';

export async function completeQueueItem(id: string) {
  await requireChaseUser();
  const supabase = createChaseServerClient();
  const { error } = await supabase
    .from('command_queue_items')
    .update({ status: 'done', completed_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { error: error.message };
  await logActivity('queue.completed', 'queue', id, {});
  revalidatePath('/chase-os');
  revalidatePath('/chase-os/queue');
  return { ok: true };
}

export async function snoozeQueueItem(id: string, hours: number) {
  await requireChaseUser();
  const supabase = createChaseServerClient();
  const until = new Date(Date.now() + hours * 3600 * 1000).toISOString();
  const { error } = await supabase
    .from('command_queue_items')
    .update({ status: 'snoozed', snooze_until: until })
    .eq('id', id);
  if (error) return { error: error.message };
  await logActivity('queue.snoozed', 'queue', id, { until });
  revalidatePath('/chase-os/queue');
  revalidatePath('/chase-os');
  return { ok: true };
}

export async function dismissQueueItem(id: string) {
  await requireChaseUser();
  const supabase = createChaseServerClient();
  const { error } = await supabase.from('command_queue_items').update({ status: 'dismissed' }).eq('id', id);
  if (error) return { error: error.message };
  await logActivity('queue.dismissed', 'queue', id, {});
  revalidatePath('/chase-os/queue');
  revalidatePath('/chase-os');
  return { ok: true };
}
