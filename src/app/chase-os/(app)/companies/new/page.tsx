import { requireChaseUser } from '@/lib/chase/auth';
import CompanyForm from './CompanyForm';

export const dynamic = 'force-dynamic';

export default async function NewCompanyPage() {
  await requireChaseUser();
  return (
    <div className="mx-auto w-full max-w-xl">
      <h1 className="mb-1 text-2xl font-bold text-brand-navy">New company</h1>
      <p className="mb-5 text-sm text-slate-600">Track a relationship — link tasks, people, and deals to it.</p>
      <CompanyForm />
    </div>
  );
}
