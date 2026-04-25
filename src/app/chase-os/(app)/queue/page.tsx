import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser } from '@/lib/chase/auth';
import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import EmptyState from '@/components/chase/shared/EmptyState';
import QueueItem from '@/components/chase/queue/QueueItem';
import type { CommandQueueItem } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

export default async function QueuePage() {
  await requireChaseUser();
  const supabase = createChaseServerClient();

  const [{ data: pending }, { data: snoozed }, { data: done }] = await Promise.all([
    supabase.from('command_queue_items').select('*').eq('status', 'pending').order('created_at'),
    supabase.from('command_queue_items').select('*').eq('status', 'snoozed').order('snooze_until'),
    supabase.from('command_queue_items').select('*').eq('status', 'done').order('completed_at', { ascending: false }).limit(10),
  ]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-brand-navy sm:text-3xl">Command Queue</h1>
        <p className="mt-1 text-sm text-slate-600">Pending, snoozed, and recently completed items.</p>
      </div>

      <Card>
        <CardHeader title="Pending" subtitle={`${pending?.length ?? 0} item${(pending?.length ?? 0) === 1 ? '' : 's'}`} />
        <CardBody className="!p-0">
          {pending && pending.length > 0 ? (
            (pending as CommandQueueItem[]).map((q) => <QueueItem key={q.id} item={q} />)
          ) : (
            <div className="p-5"><EmptyState title="Queue is clear" /></div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Snoozed" />
        <CardBody className="!p-0">
          {snoozed && snoozed.length > 0 ? (
            (snoozed as CommandQueueItem[]).map((q) => <QueueItem key={q.id} item={q} />)
          ) : (
            <div className="p-5"><EmptyState title="Nothing snoozed" /></div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Recently done" />
        <CardBody className="!p-0">
          {done && done.length > 0 ? (
            (done as CommandQueueItem[]).map((q) => <QueueItem key={q.id} item={q} showActions={false} />)
          ) : (
            <div className="p-5"><EmptyState title="No recent completions" /></div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
