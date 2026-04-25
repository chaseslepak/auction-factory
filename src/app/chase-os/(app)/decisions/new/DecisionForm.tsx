'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createDecision } from '@/lib/chase/actions/decisions';
import type { Company } from '@/lib/chase/types';

const labelCls = 'block text-xs font-medium uppercase tracking-wide text-slate-600';
const inputCls = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-blue focus:outline-none';

export default function DecisionForm({ companies }: { companies: Pick<Company, 'id' | 'name'>[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createDecision(fd);
      if ('error' in res && res.error) setError(res.error);
      else if ('id' in res && res.id) router.push(`/chase-os/decisions/${res.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <label className="block">
        <span className={labelCls}>Title</span>
        <input name="title" required className={inputCls} placeholder="What needs to be decided?" />
      </label>
      <label className="block">
        <span className={labelCls}>Context</span>
        <textarea name="context" rows={3} className={inputCls} placeholder="Background, constraints, stakeholders…" />
      </label>
      <label className="block">
        <span className={labelCls}>Options (one per line)</span>
        <textarea name="options" rows={3} className={inputCls} placeholder={'Approve full $250k\nApprove $125k\nDecline'} />
      </label>
      <label className="block">
        <span className={labelCls}>Recommendation</span>
        <textarea name="recommendation" rows={2} className={inputCls} placeholder="Your rec + reasoning." />
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>Company</span>
          <select name="company_id" defaultValue="" className={inputCls}>
            <option value="">— None —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Due</span>
          <input type="datetime-local" name="due_date" className={inputCls} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="client_visible" className="h-4 w-4 rounded border-slate-300" />
        Visible to client
      </label>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="submit" disabled={pending} className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60">
          {pending ? 'Creating…' : 'Open decision'}
        </button>
      </div>
    </form>
  );
}
