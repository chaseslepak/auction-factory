import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser } from '@/lib/chase/auth';
import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import DealStageControls from '@/components/chase/deals/DealStageControls';
import type { Company, Deal } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

export default async function DealDetail({ params }: { params: { id: string } }) {
  await requireChaseUser();
  const supabase = createChaseServerClient();
  const { data: deal } = await supabase.from('deals').select('*').eq('id', params.id).maybeSingle<Deal>();
  if (!deal) notFound();

  const { data: company } = deal.company_id
    ? await supabase.from('companies').select('*').eq('id', deal.company_id).maybeSingle<Company>()
    : { data: null };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <Link href="/chase-os/deals" className="text-xs font-semibold text-brand-blue hover:underline">
          ← All deals
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-brand-navy sm:text-3xl">{deal.name}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
          <span className="text-lg font-bold text-emerald-700">${(deal.value_cents / 100).toLocaleString()}</span>
          <span className="text-xs text-slate-500">· {deal.probability}%</span>
          {company ? (
            <span className="text-xs text-slate-500">· <Link href={`/chase-os/companies/${company.id}`} className="text-brand-blue hover:underline">{company.name}</Link></span>
          ) : null}
          {deal.expected_close_date ? <span className="text-xs text-slate-500">· close {new Date(deal.expected_close_date).toLocaleDateString()}</span> : null}
        </div>
      </div>

      <Card>
        <CardHeader title="Stage" />
        <CardBody>
          <DealStageControls dealId={deal.id} current={deal.stage} />
        </CardBody>
      </Card>

      {deal.notes ? (
        <Card>
          <CardHeader title="Notes" />
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{deal.notes}</p>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
