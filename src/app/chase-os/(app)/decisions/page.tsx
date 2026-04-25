import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser } from '@/lib/chase/auth';
import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import EmptyState from '@/components/chase/shared/EmptyState';
import type { Decision } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  deferred: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default async function DecisionsPage() {
  await requireChaseUser();
  const supabase = createChaseServerClient();
  const { data: decisions } = await supabase.from('decisions').select('*').order('due_date', { ascending: true, nullsFirst: false });

  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">Decisions</h1>
        <p className="mt-1 text-sm text-slate-600">What needs deciding, with options and recommendations.</p>
      </div>
      <Card>
        <CardHeader title="All decisions" subtitle={`${decisions?.length ?? 0}`} />
        <CardBody className="!p-0">
          {decisions && decisions.length > 0 ? (
            <ul>
              {(decisions as Decision[]).map((d) => (
                <li key={d.id} className="border-b border-slate-100 px-4 py-4 last:border-b-0 sm:px-5">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-brand-navy">{d.title}</h3>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_STYLE[d.status] ?? ''}`}>
                      {d.status}
                    </span>
                  </div>
                  {d.context ? <p className="mt-1 text-xs text-slate-600">{d.context}</p> : null}
                  {d.recommendation ? (
                    <p className="mt-2 text-xs text-slate-700">
                      <span className="font-semibold uppercase tracking-wide text-slate-500">Rec:</span> {d.recommendation}
                    </p>
                  ) : null}
                  {d.due_date ? (
                    <p className="mt-1 text-[11px] text-slate-400">Due {new Date(d.due_date).toLocaleDateString()}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5"><EmptyState title="No decisions on the table" /></div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
