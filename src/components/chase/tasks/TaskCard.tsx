import Link from 'next/link';
import type { Task } from '@/lib/chase/types';
import { PriorityBadge, StatusBadge, UrgencyBadge } from '../shared/Badge';

export default function TaskCard({ task, companyName }: { task: Task; companyName?: string | null }) {
  const due = task.due_date ? new Date(task.due_date) : null;
  const overdue = due && due < new Date() && !['done', 'archived'].includes(task.status);

  return (
    <Link
      href={`/chase-os/tasks/${task.id}`}
      className="block border-b border-slate-100 px-4 py-3 transition hover:bg-slate-50 last:border-b-0 sm:px-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-brand-navy">{task.title}</h3>
          {task.description ? (
            <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">{task.description}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <PriorityBadge value={task.priority} />
            <UrgencyBadge value={task.urgency} />
            <StatusBadge value={task.status} />
            {companyName ? <span className="text-slate-500">· {companyName}</span> : null}
            {due ? (
              <span className={overdue ? 'text-rose-600 font-medium' : ''}>
                · due {due.toLocaleDateString()}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
