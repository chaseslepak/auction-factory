import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser } from '@/lib/chase/auth';
import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import Avatar from '@/components/chase/shared/Avatar';
import type { Company, Person } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

export default async function PersonDetail({ params }: { params: { id: string } }) {
  await requireChaseUser();
  const supabase = createChaseServerClient();
  const { data: person } = await supabase.from('people').select('*').eq('id', params.id).maybeSingle<Person>();
  if (!person) notFound();

  const { data: company } = person.company_id
    ? await supabase.from('companies').select('*').eq('id', person.company_id).maybeSingle<Company>()
    : { data: null };

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <Link href="/chase-os/people" className="text-xs font-semibold text-brand-blue hover:underline">
          ← All people
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <Avatar name={person.full_name} size={48} />
          <div>
            <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">{person.full_name}</h1>
            <p className="text-sm text-slate-500">
              {person.role_title}
              {person.role_title && company ? ' · ' : ''}
              {company ? <Link className="text-brand-blue hover:underline" href={`/chase-os/companies/${company.id}`}>{company.name}</Link> : null}
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader title="Contact" />
        <CardBody className="space-y-2 text-sm">
          {person.email ? (
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Email</span>
              <div><a className="text-brand-blue hover:underline" href={`mailto:${person.email}`}>{person.email}</a></div>
            </div>
          ) : null}
          {person.phone ? (
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Phone</span>
              <div><a className="text-brand-blue hover:underline" href={`tel:${person.phone}`}>{person.phone}</a></div>
            </div>
          ) : null}
          {!person.email && !person.phone ? (
            <p className="text-slate-500">No contact info on file.</p>
          ) : null}
        </CardBody>
      </Card>

      {person.notes ? (
        <Card>
          <CardHeader title="Notes" />
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-slate-700">{person.notes}</p>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
