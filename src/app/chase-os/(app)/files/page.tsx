import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import EmptyState from '@/components/chase/shared/EmptyState';
import { requireChaseUser } from '@/lib/chase/auth';

export const dynamic = 'force-dynamic';

export default async function FilesPage() {
  await requireChaseUser();
  return (
    <div className="mx-auto w-full max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">Files</h1>
        <p className="mt-1 text-sm text-slate-600">Documents tied to companies or tasks.</p>
      </div>
      <Card>
        <CardHeader title="All files" />
        <CardBody>
          <EmptyState
            title="Files surface coming next"
            description="Schema, RLS, and storage buckets are in place. Upload UI ships in the next iteration."
          />
        </CardBody>
      </Card>
    </div>
  );
}
