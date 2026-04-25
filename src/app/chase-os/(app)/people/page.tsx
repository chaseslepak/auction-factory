import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser } from '@/lib/chase/auth';
import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import EmptyState from '@/components/chase/shared/EmptyState';
import type { Company, Person } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

export default async function PeoplePage() {
  await requireChaseUser();
  const supabase = createChaseServerClient();
  const [{ data: people }, { data: companies }] = await Promise.all([
    supabase.from('people').select('*').order('full_name'),
    supabase.from('companies').select('id, name'),
  ]);
  const companyById = new Map(((companies as Company[]) || []).map((c) => [c.id, c.name]));

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">People</h1>
        <p className="mt-1 text-sm text-slate-600">Contacts across companies. Full CRUD coming next.</p>
      </div>
      <Card>
        <CardHeader title="All people" subtitle={`${people?.length ?? 0}`} />
        <CardBody className="!p-0">
          {people && people.length > 0 ? (
            <ul>
              {(people as Person[]).map((p) => (
                <li key={p.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0 sm:px-5">
                  <div className="text-sm font-semibold text-brand-navy">{p.full_name}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {p.role_title ? <span>{p.role_title}</span> : null}
                    {p.role_title && p.company_id ? <span> · </span> : null}
                    {p.company_id ? <span>{companyById.get(p.company_id)}</span> : null}
                    {p.email ? <span> · {p.email}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5"><EmptyState title="No people yet" /></div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
