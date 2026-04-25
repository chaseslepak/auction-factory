import type { TaskPriority, TaskStatus, TaskUrgency } from '@/lib/chase/types';
import { PRIORITY_LABEL, STATUS_LABEL, URGENCY_LABEL } from '@/lib/chase/types';

const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: 'bg-slate-100 text-slate-600 border-slate-200',
  normal: 'bg-blue-50 text-blue-700 border-blue-200',
  high: 'bg-amber-50 text-amber-800 border-amber-200',
  critical: 'bg-rose-50 text-rose-800 border-rose-200',
};

const URGENCY_STYLES: Record<TaskUrgency, string> = {
  whenever: 'bg-slate-100 text-slate-600 border-slate-200',
  this_week: 'bg-sky-50 text-sky-700 border-sky-200',
  today: 'bg-amber-50 text-amber-800 border-amber-200',
  now: 'bg-rose-100 text-rose-900 border-rose-300',
};

const STATUS_STYLES: Record<TaskStatus, string> = {
  inbox: 'bg-slate-100 text-slate-700 border-slate-200',
  triaged: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  in_progress: 'bg-sky-50 text-sky-800 border-sky-200',
  blocked: 'bg-rose-50 text-rose-800 border-rose-200',
  done: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  archived: 'bg-slate-50 text-slate-500 border-slate-200',
};

const baseChip = 'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap';

export function PriorityBadge({ value }: { value: TaskPriority }) {
  return <span className={`${baseChip} ${PRIORITY_STYLES[value]}`}>{PRIORITY_LABEL[value]}</span>;
}

export function UrgencyBadge({ value }: { value: TaskUrgency }) {
  return <span className={`${baseChip} ${URGENCY_STYLES[value]}`}>{URGENCY_LABEL[value]}</span>;
}

export function StatusBadge({ value }: { value: TaskStatus }) {
  return <span className={`${baseChip} ${STATUS_STYLES[value]}`}>{STATUS_LABEL[value]}</span>;
}

export function RoleBadge({ value }: { value: string }) {
  return (
    <span className={`${baseChip} bg-brand-navy/10 text-brand-navy border-brand-navy/20 capitalize`}>
      {value.replace('_', ' ')}
    </span>
  );
}
