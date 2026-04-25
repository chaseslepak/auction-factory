import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser, isStaff } from '@/lib/chase/auth';
import { redirect } from 'next/navigation';
import DecisionForm from './DecisionForm';
import type { Company } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

export default async function NewDecisionPage() {
  const { profile } = await requireChaseUser();
  if (!isStaff(profile.role)) redirect('/chase-os/decisions');
  const supabase = createChaseServerClient();
  const { data: companies } = await supabase.from('companies').select('id, name').order('name');

  return (
    <div className="mx-auto w-full max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold text-brand-navy">New decision</h1>
      <p className="mb-5 text-sm text-slate-600">Capture options, a recommendation, and a due date.</p>
      <DecisionForm companies={(companies as Pick<Company, 'id' | 'name'>[]) || []} />
    </div>
  );
}
