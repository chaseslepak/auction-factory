'use client';

import { useState, useTransition } from 'react';
import { completeQueueItem, snoozeQueueItem, dismissQueueItem } from '@/lib/chase/actions/queue';

export default function QueueActions({ id, canSnooze = true }: { id: string; canSnooze?: boolean }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => completeQueueItem(id).then(() => undefined))}
        className="rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
        aria-label="Mark done"
      >
        Done
      </button>
      {canSnooze ? (
        <div className="relative">
          <button
            type="button"
            disabled={pending}
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Snooze
          </button>
          {open ? (
            <div className="absolute right-0 z-10 mt-1 w-32 rounded-md border border-slate-200 bg-white py-1 text-xs shadow-md">
              {[
                ['1h', 1],
                ['4h', 4],
                ['Tomorrow', 20],
                ['Next week', 24 * 7],
              ].map(([label, hours]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    start(() => snoozeQueueItem(id, hours as number).then(() => undefined));
                  }}
                  className="block w-full px-3 py-1.5 text-left hover:bg-slate-50"
                >
                  {label as string}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => start(() => dismissQueueItem(id).then(() => undefined))}
        className="rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
