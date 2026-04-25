import Link from 'next/link';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser } from '@/lib/chase/auth';
import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import EmptyState from '@/components/chase/shared/EmptyState';
import type { Company } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

export default async function CompaniesPage() {
  await requireChaseUser();
  const supabase = createChaseServerClient();
  const { data: companies } = await supabase.from('companies').select('*').order('name');

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">Companies</h1>
          <p className="mt-1 text-sm text-slate-600">Active relationships and engagements.</p>
        </div>
        <Link
          href="/chase-os/companies/new"
          className="inline-flex items-center rounded-lg bg-brand-blue px-3 py-2 text-sm font-semibold text-white hover:bg-brand-blue/90"
        >
          + New company
        </Link>
      </div>

      <Card>
        <CardHeader title="All companies" subtitle={`${companies?.length ?? 0}`} />
        <CardBody className="!p-0">
          {companies && companies.length > 0 ? (
            <ul>
              {(companies as Company[]).map((c) => (
                <li key={c.id} className="border-b border-slate-100 last:border-b-0">
                  <Link href={`/chase-os/companies/${c.id}`} className="block px-4 py-3 transition hover:bg-slate-50 sm:px-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-semibold text-brand-navy">{c.name}</h3>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {c.industry ? <span>{c.industry}</span> : null}
                          {c.industry && c.domain ? <span> · </span> : null}
                          {c.domain ? <span>{c.domain}</span> : null}
                        </div>
                        {c.notes ? <p className="mt-1 line-clamp-1 text-xs text-slate-500">{c.notes}</p> : null}
                      </div>
                      <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
                        {c.status}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState
                title="No companies yet"
                description="Add a company to start tracking tasks, people, and deals against it."
                action={
                  <Link href="/chase-os/companies/new" className="inline-flex rounded-lg bg-brand-blue px-3 py-1.5 text-sm font-semibold text-white">
                    + New company
                  </Link>
                }
              />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
