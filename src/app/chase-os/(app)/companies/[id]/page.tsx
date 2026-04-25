import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser } from '@/lib/chase/auth';
import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import EmptyState from '@/components/chase/shared/EmptyState';
import TaskCard from '@/components/chase/tasks/TaskCard';
import type { Company, Deal, Person, Task } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

export default async function CompanyDetailPage({ params }: { params: { id: string } }) {
  await requireChaseUser();
  const supabase = createChaseServerClient();

  const { data: company } = await supabase.from('companies').select('*').eq('id', params.id).maybeSingle<Company>();
  if (!company) notFound();

  const [{ data: tasks }, { data: people }, { data: deals }] = await Promise.all([
    supabase.from('tasks').select('*').eq('company_id', company.id).order('created_at', { ascending: false }),
    supabase.from('people').select('*').eq('company_id', company.id).order('full_name'),
    supabase.from('deals').select('*').eq('company_id', company.id).order('expected_close_date'),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <Link href="/chase-os/companies" className="text-xs font-semibold text-brand-blue hover:underline">
          ← All companies
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-brand-navy sm:text-3xl">{company.name}</h1>
        <div className="mt-1 text-sm text-slate-500">
          {company.industry}{company.industry && company.domain ? ' · ' : ''}{company.domain}
        </div>
        {company.notes ? <p className="mt-2 max-w-2xl text-sm text-slate-700">{company.notes}</p> : null}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Tasks" subtitle={`${tasks?.length ?? 0}`} />
          <CardBody className="!p-0">
            {tasks && tasks.length > 0 ? (
              (tasks as Task[]).map((t) => <TaskCard key={t.id} task={t} />)
            ) : (
              <div className="p-5"><EmptyState title="No tasks for this company" /></div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="People" subtitle={`${people?.length ?? 0}`} />
            <CardBody className="!p-0">
              {people && people.length > 0 ? (
                <ul>
                  {(people as Person[]).map((p) => (
                    <li key={p.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0 sm:px-5">
                      <div className="text-sm font-medium text-brand-navy">{p.full_name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {p.role_title}{p.email ? ` · ${p.email}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-5"><EmptyState title="No people" /></div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Deals" subtitle={`${deals?.length ?? 0}`} />
            <CardBody className="!p-0">
              {deals && deals.length > 0 ? (
                <ul>
                  {(deals as Deal[]).map((d) => (
                    <li key={d.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0 sm:px-5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-brand-navy">{d.name}</span>
                        <span className="text-xs font-semibold text-emerald-700">${(d.value_cents / 100).toLocaleString()}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500 capitalize">
                        {d.stage} · {d.probability}%
                        {d.expected_close_date ? ` · close ${new Date(d.expected_close_date).toLocaleDateString()}` : ''}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-5"><EmptyState title="No deals" /></div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
