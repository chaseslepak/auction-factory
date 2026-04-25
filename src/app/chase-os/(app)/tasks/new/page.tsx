import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser } from '@/lib/chase/auth';
import TaskForm from './TaskForm';
import type { Company, Profile } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

export default async function NewTaskPage() {
  const { profile } = await requireChaseUser();
  const supabase = createChaseServerClient();
  const [{ data: companies }, { data: assignees }] = await Promise.all([
    supabase.from('companies').select('id, name').order('name'),
    supabase.from('profiles').select('id, display_name, role').in('role', ['owner', 'admin', 'team_member']),
  ]);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold text-brand-navy">New task</h1>
      <p className="mb-5 text-sm text-slate-600">Submit something for triage. You can add comments and attachments after creation.</p>
      <TaskForm
        currentRole={profile.role}
        companies={(companies as Pick<Company, 'id' | 'name'>[]) || []}
        assignees={(assignees as Pick<Profile, 'id' | 'display_name' | 'role'>[]) || []}
      />
    </div>
  );
}
