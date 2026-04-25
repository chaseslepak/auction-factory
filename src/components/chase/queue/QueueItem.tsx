import Link from 'next/link';
import type { CommandQueueItem } from '@/lib/chase/types';
import QueueActions from './QueueActions';

export default function QueueItem({ item, showActions = true }: { item: CommandQueueItem; showActions?: boolean }) {
  const sourceHref =
    item.source_type === 'task' && item.source_id
      ? `/chase-os/tasks/${item.source_id}`
      : item.source_type === 'decision' && item.source_id
      ? `/chase-os/decisions`
      : null;
  const snoozedUntil = item.snooze_until ? new Date(item.snooze_until) : null;

  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {sourceHref ? (
            <Link href={sourceHref} className="truncate text-sm font-semibold text-brand-navy hover:underline">
              {item.title}
            </Link>
          ) : (
            <span className="truncate text-sm font-semibold text-brand-navy">{item.title}</span>
          )}
          {item.source_type ? (
            <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-500">
              {item.source_type}
            </span>
          ) : null}
        </div>
        {item.body ? <p className="mt-0.5 text-sm text-slate-600">{item.body}</p> : null}
        {snoozedUntil ? (
          <p className="mt-1 text-[11px] text-slate-400">Snoozed until {snoozedUntil.toLocaleString()}</p>
        ) : null}
      </div>
      {showActions ? <QueueActions id={item.id} canSnooze={item.status !== 'snoozed'} /> : null}
    </div>
  );
}
