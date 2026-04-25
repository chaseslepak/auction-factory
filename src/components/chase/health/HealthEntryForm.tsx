'use client';

import { useState, useTransition } from 'react';
import { logHealthEntry } from '@/lib/chase/actions/health';

const labelCls = 'block text-xs font-medium uppercase tracking-wide text-slate-600';
const inputCls = 'mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-blue focus:outline-none';

export default function HealthEntryForm() {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<'idle' | 'ok' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await logHealthEntry(fd);
      if ('error' in res && res.error) {
        setStatus('error');
        setError(res.error);
      } else {
        setStatus('ok');
        setTimeout(() => setStatus('idle'), 1500);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className={labelCls}>Date</span>
          <input type="date" name="entry_date" defaultValue={today} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Sleep (hrs)</span>
          <input type="number" step="0.25" min="0" max="16" name="sleep_hours" className={inputCls} placeholder="7.5" />
        </label>
        <label className="block">
          <span className={labelCls}>Energy (0-10)</span>
          <input type="number" min="0" max="10" name="energy" className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>Mood (0-10)</span>
          <input type="number" min="0" max="10" name="mood" className={inputCls} />
        </label>
      </div>
      <label className="block">
        <span className={labelCls}>Notes</span>
        <textarea name="notes" rows={2} className={inputCls} placeholder="What stood out today?" />
      </label>
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
      <div className="flex items-center justify-end gap-2">
        {status === 'ok' ? <span className="text-xs font-medium text-emerald-700">Saved.</span> : null}
        <button type="submit" disabled={pending} className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60">
          {pending ? 'Saving…' : 'Save entry'}
        </button>
      </div>
    </form>
  );
}
