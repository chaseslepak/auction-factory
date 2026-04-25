'use client';

import { useTransition } from 'react';
import { updateTaskStatus } from '@/lib/chase/actions/tasks';
import type { TaskStatus } from '@/lib/chase/types';
import { STATUS_LABEL } from '@/lib/chase/types';

const ORDER: TaskStatus[] = ['inbox', 'triaged', 'in_progress', 'blocked', 'done', 'archived'];

export default function TaskStatusControls({ taskId, current }: { taskId: string; current: TaskStatus }) {
  const [pending, start] = useTransition();
  return (
    <div className="-mx-1 flex flex-wrap gap-1">
      {ORDER.map((s) => {
        const active = s === current;
        return (
          <button
            key={s}
            type="button"
            disabled={pending || active}
            onClick={() => start(() => updateTaskStatus(taskId, s).then(() => undefined))}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              active
                ? 'bg-brand-navy text-white'
                : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
            } disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {STATUS_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}
