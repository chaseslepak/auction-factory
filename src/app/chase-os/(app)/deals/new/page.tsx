import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser, isStaff } from '@/lib/chase/auth';
import { redirect } from 'next/navigation';
import DealForm from './DealForm';
import type { Company } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

export default async function NewDealPage() {
  const { profile } = await requireChaseUser();
  if (!isStaff(profile.role)) redirect('/chase-os/deals');
  const supabase = createChaseServerClient();
  const { data: companies } = await supabase.from('companies').select('id, name').order('name');

  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="mb-1 text-2xl font-bold text-brand-navy">New deal</h1>
      <p className="mb-5 text-sm text-slate-600">Track a revenue opportunity through the pipeline.</p>
      <DealForm companies={(companies as Pick<Company, 'id' | 'name'>[]) || []} />
    </div>
  );
}
