'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createCompany } from '@/lib/chase/actions/companies';

const labelCls = 'block text-xs font-medium uppercase tracking-wide text-slate-600';
const inputCls = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-blue focus:outline-none';

export default function CompanyForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createCompany(fd);
      if ('error' in res && res.error) setError(res.error);
      else if ('id' in res && res.id) router.push(`/chase-os/companies/${res.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <label className="block">
        <span className={labelCls}>Name</span>
        <input name="name" required className={inputCls} placeholder="Acme Holdings" />
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>Domain</span>
          <input name="domain" className={inputCls} placeholder="acme.com" />
        </label>
        <label className="block">
          <span className={labelCls}>Industry</span>
          <input name="industry" className={inputCls} placeholder="Holding co" />
        </label>
      </div>
      <label className="block">
        <span className={labelCls}>Notes</span>
        <textarea name="notes" rows={3} className={inputCls} placeholder="Context, history, key contacts…" />
      </label>
      {error ? <p className="text-sm text-rose-700">{error}</p> : null}
      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={() => router.back()} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button>
        <button type="submit" disabled={pending} className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60">
          {pending ? 'Creating…' : 'Create company'}
        </button>
      </div>
    </form>
  );
}
