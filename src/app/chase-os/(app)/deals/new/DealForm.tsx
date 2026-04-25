'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createDeal } from '@/lib/chase/actions/deals';
import type { Company } from '@/lib/chase/types';

const labelCls = 'block text-xs font-medium uppercase tracking-wide text-slate-600';
const inputCls = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-blue focus:outline-none';

export default function DealForm({ companies }: { companies: Pick<Company, 'id' | 'name'>[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createDeal(fd);
      if ('error' in res && res.error) setError(res.error);
      else if ('id' in res && res.id) router.push(`/chase-os/deals/${res.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <label className="block">
        <span className={labelCls}>Name</span>
        <input name="name" required className={inputCls} placeholder="Acme retainer expansion" />
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>Value (USD)</span>
          <input type="number" name="value_dollars" step="100" min="0" className={inputCls} placeholder="180000" />
        </label>
        <label className="block">
          <span className={labelCls}>Company</span>
          <select name="company_id" defaultValue="" className={inputCls}>
            <option value="">— None —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Stage</span>
          <select name="stage" defaultValue="lead" className={inputCls}>
            <option value="lead">Lead</option>
            <option value="qualified">Qualified</option>
            <option value="proposal">Proposal</option>
            <option value="negotiation">Negotiation</option>
            <option value="won">Won</option>
            <option value="lost">Lost</option>
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>Probability %</span>
          <input type="number" name="probability" min="0" max="100" defaultValue={20} className={inputCls} />
        </label>
        <label className="block sm:col-span-2">
          <span className={labelCls}>Expected close</span>
          <input type="date" name="expected_close_date" className={inputCls} />
        </label>
      </div>
      <label className="block">
        <span className={labelCls}>Notes</span>
        <textarea name="notes" rows={3} className={inputCls} />
      </label>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="submit" disabled={pending} className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60">
          {pending ? 'Creating…' : 'Create deal'}
        </button>
      </div>
    </form>
  );
}
