import Link from 'next/link';
import { createChaseServerClient } from '@/lib/chase/supabase/server';
import { requireChaseUser } from '@/lib/chase/auth';
import { Card, CardBody, CardHeader } from '@/components/chase/shared/Card';
import EmptyState from '@/components/chase/shared/EmptyState';
import QueueItem from '@/components/chase/queue/QueueItem';
import { PriorityBadge, StatusBadge, UrgencyBadge } from '@/components/chase/shared/Badge';
import type { CommandQueueItem, Decision, Task } from '@/lib/chase/types';

export const dynamic = 'force-dynamic';

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return 'Late night';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default async function TodayPage() {
  const { profile } = await requireChaseUser();
  const supabase = createChaseServerClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const [{ data: queue }, { data: priorities }, { data: decisions }, { data: todays }] = await Promise.all([
    supabase
      .from('command_queue_items')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5),
    supabase
      .from('tasks')
      .select('*')
      .in('priority', ['high', 'critical'])
      .not('status', 'in', '(done,archived)')
      .order('priority', { ascending: false })
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(3),
    supabase
      .from('decisions')
      .select('*')
      .eq('status', 'pending')
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(3),
    supabase
      .from('tasks')
      .select('*')
      .gte('due_date', todayStart.toISOString())
      .lt('due_date', todayEnd.toISOString())
      .not('status', 'in', '(done,archived)')
      .order('priority', { ascending: false }),
  ]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        <h1 className="mt-1 text-2xl font-bold text-brand-navy sm:text-3xl">
          {greeting()}, {profile.display_name.split(' ')[0]}.
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          {(queue?.length ?? 0)} item{(queue?.length ?? 0) === 1 ? '' : 's'} on the queue · {(todays?.length ?? 0)} due today · {(decisions?.length ?? 0)} pending decision{(decisions?.length ?? 0) === 1 ? '' : 's'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader
            title="Command Queue"
            subtitle="Top of the stack"
            action={
              <Link href="/chase-os/queue" className="text-xs font-semibold text-brand-blue hover:underline">
                View all →
              </Link>
            }
          />
          <CardBody className="!p-0">
            {queue && queue.length > 0 ? (
              <div>{queue.map((q) => <QueueItem key={q.id} item={q as CommandQueueItem} />)}</div>
            ) : (
              <div className="p-5">
                <EmptyState title="Queue is clear" description="Nothing pending. Capture a new task or take a breath." />
              </div>
            )}
          </CardBody>
        </Card>

        <div className="space-y-5 lg:col-span-5">
          <Card>
            <CardHeader title="Top priorities" subtitle="High & critical, open" />
            <CardBody className="!p-0">
              {priorities && priorities.length > 0 ? (
                <ul>
                  {(priorities as Task[]).map((t) => (
                    <li key={t.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0 sm:px-5">
                      <Link href={`/chase-os/tasks/${t.id}`} className="block">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-medium text-brand-navy hover:underline">{t.title}</span>
                          <PriorityBadge value={t.priority} />
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                          <UrgencyBadge value={t.urgency} />
                          <StatusBadge value={t.status} />
                          {t.due_date ? <span>· due {new Date(t.due_date).toLocaleDateString()}</span> : null}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-5"><EmptyState title="No high-priority items" /></div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Pending decisions" />
            <CardBody className="!p-0">
              {decisions && decisions.length > 0 ? (
                <ul>
                  {(decisions as Decision[]).map((d) => (
                    <li key={d.id} className="border-b border-slate-100 last:border-b-0">
                      <Link href={`/chase-os/decisions/${d.id}`} className="block px-4 py-3 transition hover:bg-slate-50 sm:px-5">
                        <p className="font-medium text-brand-navy hover:underline">{d.title}</p>
                        {d.recommendation ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">Rec: {d.recommendation}</p>
                        ) : null}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="p-5"><EmptyState title="No pending decisions" /></div>
              )}
            </CardBody>
          </Card>
        </div>

        <Card className="lg:col-span-12">
          <CardHeader
            title="Today"
            subtitle="Tasks due today"
            action={
              <Link href="/chase-os/tasks" className="text-xs font-semibold text-brand-blue hover:underline">
                All tasks →
              </Link>
            }
          />
          <CardBody className="!p-0">
            {todays && todays.length > 0 ? (
              <ul>
                {(todays as Task[]).map((t) => (
                  <li key={t.id} className="border-b border-slate-100 px-4 py-3 last:border-b-0 sm:px-5">
                    <Link href={`/chase-os/tasks/${t.id}`} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="font-medium text-brand-navy hover:underline">{t.title}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <PriorityBadge value={t.priority} />
                        <UrgencyBadge value={t.urgency} />
                        <StatusBadge value={t.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-5">
                <EmptyState
                  title="Nothing due today"
                  description="Capture a new task to get something on deck."
                  action={
                    <Link href="/chase-os/tasks/new" className="inline-flex rounded-lg bg-brand-blue px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-blue/90">
                      + New task
                    </Link>
                  }
                />
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
