'use client';

import { useTransition } from 'react';
import { setDealStage } from '@/lib/chase/actions/deals';
import type { DealStage } from '@/lib/chase/types';

const STAGES: DealStage[] = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];

export default function DealStageControls({ dealId, current }: { dealId: string; current: DealStage }) {
  const [pending, start] = useTransition();
  return (
    <div className="-mx-1 flex flex-wrap gap-1">
      {STAGES.map((s) => {
        const active = s === current;
        const colorCls =
          s === 'won'
            ? active ? 'bg-emerald-600 text-white' : 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            : s === 'lost'
            ? active ? 'bg-rose-600 text-white' : 'border border-rose-200 bg-rose-50 text-rose-800 hover:bg-rose-100'
            : active
            ? 'bg-brand-navy text-white'
            : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100';
        return (
          <button
            key={s}
            type="button"
            disabled={pending || active}
            onClick={() => start(() => setDealStage(dealId, s).then(() => undefined))}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${colorCls} disabled:cursor-not-allowed disabled:opacity-60`}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}
