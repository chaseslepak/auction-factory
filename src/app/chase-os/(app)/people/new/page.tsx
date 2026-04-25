import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser, isStaff } from '@/lib/chase/auth';
import { redirect } from 'next/navigation';
import PersonForm from './PersonForm';
import type { Company } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

export default async function NewPersonPage() {
  const { profile } = await requireChaseUser();
  if (!isStaff(profile.role)) redirect('/chase-os/people');
  const supabase = createChaseServerClient();
  const { data: companies } = await supabase.from('companies').select('id, name').order('name');

  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="mb-1 text-2xl font-bold text-brand-navy">New person</h1>
      <p className="mb-5 text-sm text-slate-600">Add a contact tied to a company.</p>
      <PersonForm companies={(companies as Pick<Company, 'id' | 'name'>[]) || []} />
    </div>
  );
}
