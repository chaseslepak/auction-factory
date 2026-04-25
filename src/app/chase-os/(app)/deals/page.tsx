import Link from 'next/link';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser, isStaff } from '@/lib/chase/auth';
import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import EmptyState from '@/components/chase/shared/EmptyState';
import type { Company, Deal } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

export default async function DealsPage() {
  const { profile } = await requireChaseUser();
  const supabase = createChaseServerClient();
  const [{ data: deals }, { data: companies }] = await Promise.all([
    supabase.from('deals').select('*').order('expected_close_date'),
    supabase.from('companies').select('id, name'),
  ]);
  const byId = new Map(((companies as Company[]) || []).map((c) => [c.id, c.name]));
  const totalValue = (deals as Deal[] || []).reduce((acc, d) => acc + d.value_cents, 0);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">Deals</h1>
          <p className="mt-1 text-sm text-slate-600">Pipeline overview — staff only.</p>
        </div>
        {isStaff(profile.role) ? (
          <Link href="/chase-os/deals/new" className="inline-flex items-center rounded-lg bg-brand-blue px-3 py-2 text-sm font-semibold text-white hover:bg-brand-blue/90">
            + New deal
          </Link>
        ) : null}
      </div>
      <Card>
        <CardHeader title="Pipeline" subtitle={`${deals?.length ?? 0} deal${(deals?.length ?? 0) === 1 ? '' : 's'} · $${(totalValue / 100).toLocaleString()} total`} />
        <CardBody className="!p-0">
          {deals && deals.length > 0 ? (
            <ul>
              {(deals as Deal[]).map((d) => (
                <li key={d.id} className="border-b border-slate-100 last:border-b-0">
                  <Link href={`/chase-os/deals/${d.id}`} className="block px-4 py-3 transition hover:bg-slate-50 sm:px-5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-brand-navy">{d.name}</span>
                      <span className="text-sm font-bold text-emerald-700">${(d.value_cents / 100).toLocaleString()}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500 capitalize">
                      {d.company_id ? `${byId.get(d.company_id)} · ` : ''}{d.stage} · {d.probability}%
                      {d.expected_close_date ? ` · close ${new Date(d.expected_close_date).toLocaleDateString()}` : ''}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState
                title="No deals in the pipeline"
                action={isStaff(profile.role) ? (
                  <Link href="/chase-os/deals/new" className="inline-flex rounded-lg bg-brand-blue px-3 py-1.5 text-sm font-semibold text-white">+ New deal</Link>
                ) : undefined}
              />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
