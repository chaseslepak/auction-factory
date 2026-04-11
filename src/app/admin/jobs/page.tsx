'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Header from '@/components/Header';

interface Job {
  id: string;
  type: string;
  status: string;
  auction_id: string | null;
  lot_id: string | null;
  error: string | null;
  result: any;
  created_at: string;
  completed_at: string | null;
  lots?: { lot_number: number; item_name: string; brand: string; model: string } | null;
}

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'failed' | 'completed' | 'pending' | 'processing'>('failed');
  const [typeFilter, setTypeFilter] = useState<'all' | 'refresh_stock_images' | 'deep_rescan'>('all');
  const supabase = createClient();

  const fetchJobs = async () => {
    setLoading(true);
    let query = supabase
      .from('jobs')
      .select('*, lots(lot_number, item_name, brand, model)')
      .order('created_at', { ascending: false })
      .limit(200);

    if (filter !== 'all') query = query.eq('status', filter);
    if (typeFilter !== 'all') query = query.eq('type', typeFilter);

    const { data } = await query;
    if (data) setJobs(data as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchJobs();
  }, [filter, typeFilter]);

  const retryJob = async (jobId: string) => {
    await supabase
      .from('jobs')
      .update({ status: 'pending', error: null, completed_at: null, started_at: null })
      .eq('id', jobId);
    fetch('/api/jobs/process', { method: 'POST' }).catch(() => {});
    fetchJobs();
  };

  const retryAllFailed = async () => {
    if (!confirm(`Retry all ${jobs.length} failed jobs?`)) return;
    await supabase
      .from('jobs')
      .update({ status: 'pending', error: null, completed_at: null, started_at: null })
      .eq('status', 'failed');
    fetch('/api/jobs/process', { method: 'POST' }).catch(() => {});
    fetchJobs();
  };

  const deleteJob = async (jobId: string) => {
    await supabase.from('jobs').delete().eq('id', jobId);
    fetchJobs();
  };

  return (
    <div className="min-h-screen bg-brand-bg pb-24">
      <Header title="Jobs" backHref="/admin" />

      <div className="p-4 space-y-3">
        <div className="flex gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium"
          >
            <option value="failed">Failed only</option>
            <option value="completed">Completed</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="all">All</option>
          </select>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as any)}
            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium"
          >
            <option value="all">All types</option>
            <option value="refresh_stock_images">Stock Image Scan</option>
            <option value="deep_rescan">Deep Rescan</option>
          </select>
        </div>

        {filter === 'failed' && jobs.length > 0 && (
          <button
            onClick={retryAllFailed}
            className="w-full py-2 rounded-lg border-2 border-brand-blue text-brand-blue text-xs font-bold uppercase"
          >
            Retry All Failed ({jobs.length})
          </button>
        )}

        {loading ? (
          <p className="text-center text-gray-400 py-12">Loading...</p>
        ) : jobs.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No jobs match</p>
        ) : (
          jobs.map((job) => (
            <div
              key={job.id}
              className={`bg-white rounded-xl p-3 shadow-sm border ${
                job.status === 'failed'
                  ? 'border-red-200'
                  : job.status === 'completed'
                    ? 'border-green-200'
                    : 'border-gray-100'
              }`}
            >
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-brand-navy truncate">
                    {job.lots?.lot_number ? `Lot #${job.lots.lot_number}: ` : ''}
                    {job.lots?.item_name || '(unknown lot)'}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {job.lots?.brand && job.lots?.model
                      ? `${job.lots.brand} ${job.lots.model}`
                      : job.lot_id}
                  </p>
                </div>
                <span
                  className={`ml-2 px-2 py-0.5 rounded text-xs font-bold ${
                    job.status === 'failed'
                      ? 'bg-red-100 text-red-700'
                      : job.status === 'completed'
                        ? 'bg-green-100 text-green-700'
                        : job.status === 'processing'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {job.status}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                {job.type === 'deep_rescan' ? '🔍 Deep Rescan' : '📸 Stock Image'} •{' '}
                {new Date(job.created_at).toLocaleString()}
              </p>
              {job.error && (
                <p className="text-xs text-red-600 mt-1 bg-red-50 rounded p-2">
                  <span className="font-bold">Error:</span> {job.error}
                </p>
              )}
              {job.result && job.result.found !== undefined && (
                <p className="text-xs text-gray-500 mt-1">
                  Stock image: {job.result.found ? '✓ found' : '✗ not found'}
                </p>
              )}
              <div className="flex gap-2 mt-2">
                {job.status === 'failed' && (
                  <button
                    onClick={() => retryJob(job.id)}
                    className="text-xs font-bold text-brand-blue"
                  >
                    Retry
                  </button>
                )}
                <button
                  onClick={() => deleteJob(job.id)}
                  className="text-xs font-bold text-gray-400 ml-auto"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
