import Link from 'next/link';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser, isStaff } from '@/lib/chase/auth';
import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import EmptyState from '@/components/chase/shared/EmptyState';
import Avatar from '@/components/chase/shared/Avatar';
import type { Company, Person } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

export default async function PeoplePage() {
  const { profile } = await requireChaseUser();
  const supabase = createChaseServerClient();
  const [{ data: people }, { data: companies }] = await Promise.all([
    supabase.from('people').select('*').order('full_name'),
    supabase.from('companies').select('id, name'),
  ]);
  const companyById = new Map(((companies as Company[]) || []).map((c) => [c.id, c.name]));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">People</h1>
          <p className="mt-1 text-sm text-slate-600">Contacts across companies.</p>
        </div>
        {isStaff(profile.role) ? (
          <Link href="/chase-os/people/new" className="inline-flex items-center rounded-lg bg-brand-blue px-3 py-2 text-sm font-semibold text-white hover:bg-brand-blue/90">
            + New person
          </Link>
        ) : null}
      </div>
      <Card>
        <CardHeader title="All people" subtitle={`${people?.length ?? 0}`} />
        <CardBody className="!p-0">
          {people && people.length > 0 ? (
            <ul>
              {(people as Person[]).map((p) => (
                <li key={p.id} className="border-b border-slate-100 last:border-b-0">
                  <Link href={`/chase-os/people/${p.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-slate-50 sm:px-5">
                    <Avatar name={p.full_name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-brand-navy">{p.full_name}</div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {p.role_title ? <span>{p.role_title}</span> : null}
                        {p.role_title && p.company_id ? <span> · </span> : null}
                        {p.company_id ? <span>{companyById.get(p.company_id)}</span> : null}
                        {p.email ? <span> · {p.email}</span> : null}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState
                title="No people yet"
                action={isStaff(profile.role) ? (
                  <Link href="/chase-os/people/new" className="inline-flex rounded-lg bg-brand-blue px-3 py-1.5 text-sm font-semibold text-white">+ New person</Link>
                ) : undefined}
              />
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
