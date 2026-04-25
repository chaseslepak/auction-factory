import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import EmptyState from '@/components/chase/shared/EmptyState';
import { requireChaseUser, isAdmin } from '@/lib/chase/auth';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const { profile } = await requireChaseUser();
  if (!isAdmin(profile.role)) redirect('/chase-os');
  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">Reports</h1>
        <p className="mt-1 text-sm text-slate-600">Saved and scheduled reports.</p>
      </div>
      <Card>
        <CardHeader title="Reports" />
        <CardBody>
          <EmptyState title="Reports module ships next" description="Schema and RLS are in place; query builder and scheduler land in the next iteration." />
        </CardBody>
      </Card>
    </div>
  );
}
