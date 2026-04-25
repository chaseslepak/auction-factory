'use client';

import { useTransition } from 'react';
import { setDecisionStatus } from '@/lib/chase/actions/decisions';
import type { DecisionStatus } from '@/lib/chase/types';

const OPTIONS: Array<{ status: DecisionStatus; label: string; cls: string }> = [
  { status: 'approved', label: 'Approve',  cls: 'bg-emerald-600 hover:bg-emerald-500 text-white' },
  { status: 'rejected', label: 'Reject',   cls: 'bg-rose-600 hover:bg-rose-500 text-white' },
  { status: 'deferred', label: 'Defer',    cls: 'bg-slate-200 hover:bg-slate-300 text-slate-700' },
  { status: 'pending',  label: 'Reopen',   cls: 'bg-white border border-slate-300 hover:bg-slate-50 text-slate-700' },
];

export default function DecisionActions({ id, current }: { id: string; current: DecisionStatus }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      {OPTIONS.filter((o) => o.status !== current).map((o) => (
        <button
          key={o.status}
          type="button"
          disabled={pending}
          onClick={() => start(() => setDecisionStatus(id, o.status).then(() => undefined))}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${o.cls}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
