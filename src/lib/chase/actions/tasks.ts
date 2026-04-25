'use server';

import { revalidatePath } from 'next/cache';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser } from '@/lib/chase/auth';
import { logActivity } from '@/lib/chase/activity';
import type { TaskPriority, TaskStatus, TaskUrgency } from '@/lib/chase/types';

const PRIORITIES: TaskPriority[] = ['low', 'normal', 'high', 'critical'];
const URGENCIES: TaskUrgency[] = ['whenever', 'this_week', 'today', 'now'];
const STATUSES: TaskStatus[] = ['inbox', 'triaged', 'in_progress', 'blocked', 'done', 'archived'];

function pickEnum<T extends string>(value: FormDataEntryValue | null, allowed: T[], fallback: T): T {
  const v = String(value || '');
  return (allowed as string[]).includes(v) ? (v as T) : fallback;
}

export async function createTask(formData: FormData) {
  const { user } = await requireChaseUser();
  const supabase = createChaseServerClient();

  const title = String(formData.get('title') || '').trim();
  if (!title) return { error: 'Title is required' };

  const description = String(formData.get('description') || '') || null;
  const company_id = (String(formData.get('company_id') || '') || null) as string | null;
  const assigned_to = (String(formData.get('assigned_to') || '') || null) as string | null;
  const priority = pickEnum(formData.get('priority'), PRIORITIES, 'normal');
  const urgency = pickEnum(formData.get('urgency'), URGENCIES, 'this_week');
  const what_is_needed_from_chase = String(formData.get('what_is_needed_from_chase') || '') || null;
  const due_date_raw = String(formData.get('due_date') || '');
  const due_date = due_date_raw ? new Date(due_date_raw).toISOString() : null;

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      title,
      description,
      company_id,
      submitted_by: user.id,
      assigned_to,
      priority,
      urgency,
      due_date,
      what_is_needed_from_chase,
      status: 'inbox',
    })
    .select('id')
    .single();

  if (error) return { error: error.message };

  await logActivity('task.created', 'task', data.id, { title });
  revalidatePath('/chase-os');
  revalidatePath('/chase-os/tasks');
  return { ok: true, id: data.id as string };
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  await requireChaseUser();
  const supabase = createChaseServerClient();
  const patch: Record<string, unknown> = { status };
  if (status === 'done') patch.completed_at = new Date().toISOString();
  if (status !== 'done') patch.completed_at = null;

  const { error } = await supabase.from('tasks').update(patch).eq('id', taskId);
  if (error) return { error: error.message };
  await logActivity('task.status_changed', 'task', taskId, { status });
  revalidatePath('/chase-os/tasks');
  revalidatePath(`/chase-os/tasks/${taskId}`);
  revalidatePath('/chase-os');
  revalidatePath('/chase-os/queue');
  return { ok: true };
}

export async function assignTask(taskId: string, assigneeId: string | null) {
  await requireChaseUser();
  const supabase = createChaseServerClient();
  const { error } = await supabase.from('tasks').update({ assigned_to: assigneeId }).eq('id', taskId);
  if (error) return { error: error.message };
  await logActivity('task.assigned', 'task', taskId, { to: assigneeId });
  revalidatePath(`/chase-os/tasks/${taskId}`);
  return { ok: true };
}

export async function addTaskComment(taskId: string, body: string) {
  const { user } = await requireChaseUser();
  if (!body.trim()) return { error: 'Comment is empty' };
  const supabase = createChaseServerClient();
  const { error } = await supabase
    .from('task_comments')
    .insert({ task_id: taskId, author_id: user.id, body: body.trim() });
  if (error) return { error: error.message };
  await logActivity('task.commented', 'task', taskId, {});
  revalidatePath(`/chase-os/tasks/${taskId}`);
  return { ok: true };
}
