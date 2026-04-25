import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import EmptyState from '@/components/chase/shared/EmptyState';
import { requireChaseUser } from '@/lib/chase/auth';
import { createChaseServerClient } from '@/lib/chase/supabase/server';

export const dynamic = 'force-dynamic';

export default async function HealthPage() {
  await requireChaseUser();
  const supabase = createChaseServerClient();
  const { data: entries } = await supabase
    .from('health_entries')
    .select('*')
    .order('entry_date', { ascending: false })
    .limit(14);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">Health</h1>
        <p className="mt-1 text-sm text-slate-600">Private journal — only you can see your entries (enforced by RLS).</p>
      </div>
      <Card>
        <CardHeader title="Recent entries" />
        <CardBody className="!p-0">
          {entries && entries.length > 0 ? (
            <ul>
              {entries.map((e: { id: string; entry_date: string; energy: number | null; sleep_hours: number | null; mood: number | null; notes: string | null }) => (
                <li key={e.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0 sm:px-5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-brand-navy">{e.entry_date}</span>
                    <span className="text-xs text-slate-500">
                      {e.sleep_hours ? `${e.sleep_hours}h sleep · ` : ''}energy {e.energy ?? '—'} · mood {e.mood ?? '—'}
                    </span>
                  </div>
                  {e.notes ? <p className="mt-0.5 text-xs text-slate-600">{e.notes}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5"><EmptyState title="No entries yet" description="Daily log UI ships in the next iteration." /></div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
