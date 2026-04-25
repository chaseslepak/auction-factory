'use server';

import { revalidatePath } from 'next/cache';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser } from '@/lib/chase/auth';
import { logActivity } from '@/lib/chase/activity';

export async function recordTaskAttachment(input: {
  task_id: string;
  storage_path: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
}) {
  const { user } = await requireChaseUser();
  const supabase = createChaseServerClient();
  const { error } = await supabase.from('task_attachments').insert({
    task_id: input.task_id,
    uploaded_by: user.id,
    storage_path: input.storage_path,
    filename: input.filename,
    size_bytes: input.size_bytes,
    mime_type: input.mime_type,
  });
  if (error) return { error: error.message };
  await logActivity('task.attached', 'task', input.task_id, { filename: input.filename });
  revalidatePath(`/chase-os/tasks/${input.task_id}`);
  return { ok: true };
}
