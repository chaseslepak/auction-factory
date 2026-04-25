'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createTask } from '@/lib/chase/actions/tasks';

export default function QuickCapture() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => titleRef.current?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    if (!String(fd.get('title') || '').trim()) return;
    // Default to inbox + this_week + normal; title only
    start(async () => {
      const res = await createTask(fd);
      if ('error' in res && res.error) setError(res.error);
      else {
        setOpen(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Quick capture a task"
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-blue text-2xl font-bold text-white shadow-lg transition hover:bg-brand-blue/90 md:bottom-6 md:right-6"
        style={{ marginBottom: 'env(safe-area-inset-bottom)' }}
      >
        +
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">Quick capture</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <form onSubmit={onSubmit} className="space-y-3">
              <input
                ref={titleRef}
                name="title"
                required
                placeholder="What needs to happen?"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base focus:border-brand-blue focus:outline-none"
              />
              <textarea
                name="description"
                rows={3}
                placeholder="Optional details…"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-blue focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-2">
                <select name="priority" defaultValue="normal" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
                <select name="urgency" defaultValue="this_week" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  <option value="whenever">Whenever</option>
                  <option value="this_week">This week</option>
                  <option value="today">Today</option>
                  <option value="now">Now</option>
                </select>
              </div>
              {error ? <p className="text-xs text-rose-700">{error}</p> : null}
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-brand-navy px-4 py-2 text-sm font-semibold text-white hover:bg-brand-navy/90 disabled:opacity-60"
                >
                  {pending ? 'Saving…' : 'Capture'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
