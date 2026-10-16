'use client';

// Live progress widget for HQ Push via worker queue.
//
// Polls /api/af-upload/queue-status/<auctionId> every 2s while any
// jobs are pending or processing. Stops polling (but keeps displaying
// the final state) when all jobs reach a terminal status.
//
// Rendered on /auctions/[id] above the lot list only when the user
// has used the queue path at least once (counts.total > 0 or hidden
// prop forces it).

import { useEffect, useRef, useState } from 'react';

interface QueueStatus {
  counts: { pending: number; processing: number; completed: number; failed: number };
  total: number;
  done: number;
  earliest: string | null;
  latest: string | null;
  failed: Array<{ lot_id: string; error: string | null }>;
}

export default function QueuePushProgress({ auctionId }: { auctionId: string }) {
  const [status, setStatus] = useState<QueueStatus | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<any>(null);

  async function fetchStatus() {
    try {
      const r = await fetch(`/api/af-upload/queue-status/${auctionId}`, { cache: 'no-store' });
      if (!r.ok) return;
      const b: QueueStatus = await r.json();
      setStatus(b);
      if (b.total > 0) setVisible(true);
    } catch {}
  }

  useEffect(() => {
    fetchStatus();
    timer.current = setInterval(() => {
      // Keep polling while jobs are in motion; also at least once a
      // minute to detect user kicks or external changes.
      const active = status && (status.counts.pending + status.counts.processing) > 0;
      if (active || !status || status.total === 0) fetchStatus();
    }, 2000);
    return () => timer.current && clearInterval(timer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctionId]);

  if (!visible || !status || status.total === 0) return null;

  const pct = status.total > 0 ? Math.round((status.done / status.total) * 100) : 0;
  const active = status.counts.pending + status.counts.processing;

  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide">
          HQ Push Queue
        </h3>
        <span className="text-xs text-gray-500 font-mono">
          {status.done}/{status.total} · {pct}%
        </span>
      </div>

      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-3">
        <div
          className={`h-full ${status.counts.failed > 0 ? 'bg-amber-500' : 'bg-brand-blue'}`}
          style={{ width: `${pct}%`, transition: 'width 0.4s ease-out' }}
        />
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-400">Pending</p>
          <p className="font-black text-brand-navy">{status.counts.pending}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-400">Running</p>
          <p className="font-black text-brand-blue">{status.counts.processing}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-400">Done</p>
          <p className="font-black text-brand-green">{status.counts.completed}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-gray-400">Failed</p>
          <p className={`font-black ${status.counts.failed > 0 ? 'text-red-500' : 'text-gray-300'}`}>
            {status.counts.failed}
          </p>
        </div>
      </div>

      {active > 0 ? (
        <p className="text-[11px] text-gray-400 mt-3">
          Worker is pushing — safe to close this tab. Progress persists.
        </p>
      ) : status.counts.failed > 0 ? (
        <p className="text-[11px] text-amber-600 mt-3">
          {status.counts.failed} lot{status.counts.failed === 1 ? '' : 's'} failed. Re-click HQ Push to retry them (uploaded lots are skipped automatically).
        </p>
      ) : status.counts.completed === status.total ? (
        <p className="text-[11px] text-brand-green mt-3">
          All lots pushed successfully.
        </p>
      ) : null}

      {active > 0 && (
        <button
          onClick={() =>
            fetch('/api/jobs/process', { method: 'POST' }).catch(() => {})
          }
          className="mt-3 w-full text-xs font-bold text-brand-blue border border-brand-blue/30 rounded py-1.5"
        >
          Kick worker
        </button>
      )}
    </div>
  );
}
