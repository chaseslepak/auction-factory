'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createTask } from '@/lib/chase/actions/tasks';
import type { ChaseRole, Company, Profile } from '@/lib/chase/types';

const labelCls = 'block text-xs font-medium uppercase tracking-wide text-slate-600';
const inputCls =
  'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-blue focus:outline-none';

export default function TaskForm({
  currentRole,
  companies,
  assignees,
}: {
  currentRole: ChaseRole;
  companies: Pick<Company, 'id' | 'name'>[];
  assignees: Pick<Profile, 'id' | 'display_name' | 'role'>[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isClient = currentRole === 'client';

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createTask(fd);
      if ('error' in res && res.error) {
        setError(res.error);
      } else if ('id' in res && res.id) {
        router.push(`/chase-os/tasks/${res.id}`);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <label className="block">
        <span className={labelCls}>Title</span>
        <input name="title" required className={inputCls} placeholder="What needs to happen?" />
      </label>

      <label className="block">
        <span className={labelCls}>Description</span>
        <textarea name="description" rows={4} className={inputCls} placeholder="Background, context, links…" />
      </label>

      <label className="block">
        <span className={labelCls}>What is needed from Chase?</span>
        <input name="what_is_needed_from_chase" className={inputCls} placeholder="Sign-off, decision, intro, response…" />
      </label>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>Priority</span>
          <select name="priority" defaultValue="normal" className={inputCls}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>

        <label className="block">
          <span className={labelCls}>Urgency</span>
          <select name="urgency" defaultValue="this_week" className={inputCls}>
            <option value="whenever">Whenever</option>
            <option value="this_week">This week</option>
            <option value="today">Today</option>
            <option value="now">Now</option>
          </select>
        </label>

        <label className="block">
          <span className={labelCls}>Due date</span>
          <input type="datetime-local" name="due_date" className={inputCls} />
        </label>

        <label className="block">
          <span className={labelCls}>Company</span>
          <select name="company_id" defaultValue="" className={inputCls}>
            <option value="">— None —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>

        {!isClient ? (
          <label className="block sm:col-span-2">
            <span className={labelCls}>Assign to</span>
            <select name="assigned_to" defaultValue="" className={inputCls}>
              <option value="">— Unassigned —</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>{a.display_name} ({a.role.replace('_', ' ')})</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error ? <p className="text-sm text-rose-700">{error}</p> : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
        >
          {pending ? 'Creating…' : 'Create task'}
        </button>
      </div>
    </form>
  );
}
