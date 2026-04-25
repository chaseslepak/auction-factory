'use client';

import { useRef, useState, useTransition } from 'react';
import { createClientInvite } from '@/lib/chase/actions/clients';
import type { Company } from '@/lib/chase/types';

const labelCls = 'block text-xs font-medium uppercase tracking-wide text-slate-600';
const inputCls = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-blue focus:outline-none';

export default function ClientInviteForm({ companies }: { companies: Pick<Company, 'id' | 'name'>[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createClientInvite(fd);
      if ('error' in res && res.error) setError(res.error);
      else {
        setOkMsg('Invite created.');
        formRef.current?.reset();
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>Client email</span>
          <input type="email" name="email" required className={inputCls} placeholder="jordan@acme.com" />
        </label>
        <label className="block">
          <span className={labelCls}>Company</span>
          <select name="company_id" required defaultValue="" className={inputCls}>
            <option value="" disabled>— Pick a company —</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      {okMsg ? <p className="text-xs text-emerald-700">{okMsg}</p> : null}
      <div className="flex justify-end">
        <button type="submit" disabled={pending} className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60">
          {pending ? 'Creating…' : 'Create invite'}
        </button>
      </div>
    </form>
  );
}
