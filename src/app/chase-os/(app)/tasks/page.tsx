import Link from 'next/link';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser } from '@/lib/chase/auth';
import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import EmptyState from '@/components/chase/shared/EmptyState';
import TaskCard from '@/components/chase/tasks/TaskCard';
import type { Company, Task, TaskStatus } from '@/lib/chase/types';
import { STATUS_LABEL } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

const FILTERS: Array<{ key: 'open' | TaskStatus | 'all'; label: string }> = [
  { key: 'open', label: 'Open' },
  { key: 'inbox', label: 'Inbox' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
  { key: 'all', label: 'All' },
];

export default async function TasksPage({ searchParams }: { searchParams: { status?: string } }) {
  await requireChaseUser();
  const supabase = createChaseServerClient();
  const filter = (searchParams.status as (typeof FILTERS)[number]['key']) || 'open';

  let query = supabase.from('tasks').select('*').order('created_at', { ascending: false });
  if (filter === 'open') query = query.not('status', 'in', '(done,archived)');
  else if (filter !== 'all') query = query.eq('status', filter);

  const [{ data: tasks }, { data: companies }] = await Promise.all([
    query,
    supabase.from('companies').select('id, name'),
  ]);

  const companyById = new Map<string, Company>(((companies as Company[]) || []).map((c) => [c.id, c]));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">Tasks</h1>
          <p className="mt-1 text-sm text-slate-600">Submit, triage, and run.</p>
        </div>
        <Link
          href="/chase-os/tasks/new"
          className="inline-flex items-center rounded-lg bg-brand-blue px-3 py-2 text-sm font-semibold text-white hover:bg-brand-blue/90"
        >
          + New task
        </Link>
      </div>

      <div className="-mx-1 flex flex-wrap gap-1 overflow-x-auto pb-1">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <Link
              key={f.key}
              href={`/chase-os/tasks${f.key === 'open' ? '' : `?status=${f.key}`}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                active ? 'bg-brand-navy text-white' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      <Card>
        <CardHeader title={filter === 'open' ? 'Open' : filter === 'all' ? 'All' : STATUS_LABEL[filter as TaskStatus]} subtitle={`${tasks?.length ?? 0} item${(tasks?.length ?? 0) === 1 ? '' : 's'}`} />
        <CardBody className="!p-0">
          {tasks && tasks.length > 0 ? (
            (tasks as Task[]).map((t) => (
              <TaskCard key={t.id} task={t} companyName={t.company_id ? companyById.get(t.company_id)?.name : null} />
            ))
          ) : (
            <div className="p-5">
              <EmptyState
                title="No tasks here"
                description="Tasks you create or are assigned to will appear here."
                action={
                  <Link href="/chase-os/tasks/new" className="inline-flex rounded-lg bg-brand-blue px-3 py-1.5 text-sm font-semibold text-white">
                    + New task
                  </Link>
                }
              />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
