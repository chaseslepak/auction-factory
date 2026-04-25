'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { createPerson } from '@/lib/chase/actions/people';
import type { Company } from '@/lib/chase/types';

const labelCls = 'block text-xs font-medium uppercase tracking-wide text-slate-600';
const inputCls = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-blue focus:outline-none';

export default function PersonForm({
  companies,
  defaultCompanyId,
}: {
  companies: Pick<Company, 'id' | 'name'>[];
  defaultCompanyId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createPerson(fd);
      if ('error' in res && res.error) setError(res.error);
      else if ('id' in res && res.id) router.push(`/chase-os/people/${res.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <label className="block">
        <span className={labelCls}>Full name</span>
        <input name="full_name" required className={inputCls} />
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>Email</span>
          <input type="email" name="email" className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Phone</span>
          <input name="phone" className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Role / Title</span>
          <input name="role_title" className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Company</span>
          <select name="company_id" defaultValue={defaultCompanyId || ''} className={inputCls}>
            <option value="">— None —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
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
          {pending ? 'Creating…' : 'Create person'}
        </button>
      </div>
    </form>
  );
}
