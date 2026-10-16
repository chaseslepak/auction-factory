'use client';

// Admin page that turns af_upload_attempts rows into actionable
// diagnosis. Error-prefix histogram, success rate, mean elapsed_ms,
// cookie-rotation rate, recent failures. Backs out of the "we don't
// know which specific error class causes the ~7% transient failure
// rate" problem that drove the whole durability pass.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Header from '@/components/Header';

type Attempt = {
  id: string;
  lot_id: string;
  attempt_num: number;
  success: boolean;
  http_status: number | null;
  error_prefix: string | null;
  elapsed_ms: number | null;
  csrf_present: boolean | null;
  cookie_rotated: boolean | null;
  af_item_id: number | null;
  created_at: string;
};

export default function UploadTelemetryPage() {
  const supabase = createClient();
  const [windowHours, setWindowHours] = useState(24);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('af_upload_attempts')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(5000);
      setAttempts((data || []) as Attempt[]);
      setLoading(false);
    })();
  }, [windowHours]);

  const total = attempts.length;
  const succeeded = attempts.filter((a) => a.success).length;
  const failed = total - succeeded;
  const succeededRate = total > 0 ? succeeded / total : 0;
  const cookieRotations = attempts.filter((a) => a.cookie_rotated).length;
  const meanElapsed = total > 0
    ? Math.round(attempts.reduce((sum, a) => sum + (a.elapsed_ms || 0), 0) / total)
    : 0;

  // Error-prefix histogram, sorted by frequency.
  const prefixHistogram: Record<string, { count: number; mean_ms: number; elapsed_sum: number }> = {};
  for (const a of attempts) {
    if (a.success) continue;
    const key = a.error_prefix || '(no error_prefix)';
    const slot = prefixHistogram[key] || { count: 0, mean_ms: 0, elapsed_sum: 0 };
    slot.count++;
    slot.elapsed_sum += a.elapsed_ms || 0;
    slot.mean_ms = Math.round(slot.elapsed_sum / slot.count);
    prefixHistogram[key] = slot;
  }
  const sortedPrefixes = Object.entries(prefixHistogram).sort(
    (a, b) => b[1].count - a[1].count
  );

  // Recent failures (first 20) so Chase can click into specific lots.
  const recentFailures = attempts.filter((a) => !a.success).slice(0, 20);

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header title="Upload Telemetry" backHref="/admin" />
      <div className="p-4 space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide">
              Window
            </h2>
            <select
              value={windowHours}
              onChange={(e) => setWindowHours(Number(e.target.value))}
              className="text-sm border border-gray-200 rounded px-2 py-1"
            >
              <option value={1}>Last 1h</option>
              <option value={6}>Last 6h</option>
              <option value={24}>Last 24h</option>
              <option value={168}>Last 7d</option>
              <option value={720}>Last 30d</option>
            </select>
          </div>
          {loading ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <Stat label="Attempts" value={total.toLocaleString()} />
              <Stat label="Success rate" value={`${Math.round(succeededRate * 100)}%`} emphasis={succeededRate < 0.9} />
              <Stat label="Mean elapsed" value={`${meanElapsed} ms`} />
              <Stat label="Cookie rotations" value={cookieRotations.toLocaleString()} />
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-3">
            Error-prefix Histogram ({failed} failures)
          </h2>
          {sortedPrefixes.length === 0 ? (
            <p className="text-xs text-gray-400">No failures in this window.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wide">
                  <th className="pb-2">Error prefix</th>
                  <th className="pb-2 text-right">Count</th>
                  <th className="pb-2 text-right">% of failures</th>
                  <th className="pb-2 text-right">Mean elapsed</th>
                </tr>
              </thead>
              <tbody>
                {sortedPrefixes.map(([prefix, data]) => (
                  <tr key={prefix} className="border-t border-gray-100">
                    <td className="py-2 font-mono text-xs">{prefix}</td>
                    <td className="py-2 text-right font-bold">{data.count}</td>
                    <td className="py-2 text-right text-gray-500">
                      {Math.round((data.count / Math.max(failed, 1)) * 100)}%
                    </td>
                    <td className="py-2 text-right text-gray-500">{data.mean_ms} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-3">
            Recent Failures (last 20)
          </h2>
          {recentFailures.length === 0 ? (
            <p className="text-xs text-gray-400">No failures in this window.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 uppercase tracking-wide">
                  <th className="pb-2">When</th>
                  <th className="pb-2">Lot</th>
                  <th className="pb-2">Attempt</th>
                  <th className="pb-2">HTTP</th>
                  <th className="pb-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {recentFailures.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100">
                    <td className="py-2 text-gray-500">
                      {new Date(a.created_at).toLocaleTimeString()}
                    </td>
                    <td className="py-2 font-mono text-[10px]">{a.lot_id.substring(0, 8)}…</td>
                    <td className="py-2 text-center">#{a.attempt_num}</td>
                    <td className="py-2">{a.http_status ?? '—'}</td>
                    <td className="py-2 font-mono text-[10px]">{a.error_prefix || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`font-black text-xl ${emphasis ? 'text-red-500' : 'text-brand-navy'}`}>
        {value}
      </p>
    </div>
  );
}
