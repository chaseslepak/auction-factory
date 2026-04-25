import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser } from '@/lib/chase/auth';
import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import DecisionActions from '@/components/chase/decisions/DecisionActions';
import type { Company, Decision } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  rejected: 'bg-rose-50 text-rose-800 border-rose-200',
  deferred: 'bg-slate-100 text-slate-700 border-slate-200',
};

export default async function DecisionDetail({ params }: { params: { id: string } }) {
  await requireChaseUser();
  const supabase = createChaseServerClient();

  const { data: decision } = await supabase
    .from('decisions')
    .select('*')
    .eq('id', params.id)
    .maybeSingle<Decision>();
  if (!decision) notFound();

  const { data: company } = decision.company_id
    ? await supabase.from('companies').select('*').eq('id', decision.company_id).maybeSingle<Company>()
    : { data: null };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <Link href="/chase-os/decisions" className="text-xs font-semibold text-brand-blue hover:underline">
          ← All decisions
        </Link>
        <div className="mt-1 flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">{decision.title}</h1>
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_STYLE[decision.status]}`}>
            {decision.status}
          </span>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {company ? <Link href={`/chase-os/companies/${company.id}`} className="text-brand-blue hover:underline">{company.name}</Link> : 'Internal'}
          {decision.due_date ? <span> · due {new Date(decision.due_date).toLocaleDateString()}</span> : null}
          {decision.decided_at ? <span> · decided {new Date(decision.decided_at).toLocaleDateString()}</span> : null}
        </div>
      </div>

      {decision.context ? (
        <Card>
          <CardHeader title="Context" />
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{decision.context}</p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Options" subtitle={`${decision.options?.length ?? 0}`} />
        <CardBody className="!p-0">
          {decision.options && decision.options.length > 0 ? (
            <ul>
              {decision.options.map((o, i) => (
                <li key={i} className="border-b border-slate-100 px-4 py-3 last:border-b-0 sm:px-5">
                  <p className="text-sm font-semibold text-brand-navy">{o.option}</p>
                  {o.pros && o.pros.length > 0 ? (
                    <p className="mt-1 text-xs text-emerald-700"><span className="font-semibold">Pros:</span> {o.pros.join(' · ')}</p>
                  ) : null}
                  {o.cons && o.cons.length > 0 ? (
                    <p className="mt-0.5 text-xs text-rose-700"><span className="font-semibold">Cons:</span> {o.cons.join(' · ')}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 text-sm text-slate-500">No options listed.</p>
          )}
        </CardBody>
      </Card>

      {decision.recommendation ? (
        <Card>
          <CardHeader title="Recommendation" />
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{decision.recommendation}</p>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Decide" />
        <CardBody>
          <DecisionActions id={decision.id} current={decision.status} />
        </CardBody>
      </Card>
    </div>
  );
}
