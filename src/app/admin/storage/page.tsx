'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';

interface Row {
  id: string;
  name: string;
  archived_at: string;
  lot_count: number;
  photo_count: number;
}

interface Overview {
  total_archived: number;
  total_photos: number;
  auctions: Row[];
}

export default function StorageCleanupPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | 'ALL' | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/cleanup-storage');
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'load failed');
      setData(d);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const purgeOne = async (row: Row) => {
    if (
      !confirm(
        `Delete ${row.photo_count} photos from "${row.name}"?\n\nPhotos will be permanently removed from storage. The auction and its lot metadata stay — only the images are dropped.`
      )
    ) {
      return;
    }
    setBusyId(row.id);
    setLastResult(null);
    try {
      const res = await fetch('/api/admin/cleanup-storage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ auction_id: row.id }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'delete failed');
      setLastResult(`Deleted ${d.photos_deleted} photos from ${row.name}`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const purgeAll = async () => {
    if (!data) return;
    if (
      !confirm(
        `Delete ALL ${data.total_photos} photos across ${data.total_archived} archived auctions?\n\nThis is not reversible. Photos will be permanently removed from Supabase Storage. Only proceed if you're sure you won't need these images again.`
      )
    ) {
      return;
    }
    setBusyId('ALL');
    setLastResult(null);
    try {
      const res = await fetch('/api/admin/cleanup-storage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'delete failed');
      const errNote =
        d.errors && d.errors.length > 0
          ? ` (${d.errors.length} auctions errored, check console)`
          : '';
      if (d.errors?.length) console.warn('cleanup errors:', d.errors);
      setLastResult(
        `Deleted ${d.photos_deleted} photos across ${d.auctions_processed} auctions${errNote}`
      );
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg pb-12">
      <Header title="Storage Cleanup" backHref="/admin" />

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-2">
          <p className="text-sm text-gray-600">
            Reclaim Supabase Storage by deleting photos from archived auctions.
            The auction records and their lot metadata are kept — only the image
            files are removed. Not reversible.
          </p>
          {data && (
            <p className="text-xs text-gray-500">
              <strong>{data.total_archived}</strong> archived auctions holding{' '}
              <strong>{data.total_photos.toLocaleString()}</strong> photos.
            </p>
          )}
        </div>

        {lastResult && (
          <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-lg p-3">
            {lastResult}
          </div>
        )}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-center text-gray-400 py-8">Loading…</p>
        ) : !data || data.auctions.length === 0 ? (
          <p className="text-center text-gray-400 py-8">
            No archived auctions.
          </p>
        ) : (
          <>
            <button
              onClick={purgeAll}
              disabled={!!busyId || data.total_photos === 0}
              className="w-full py-3 rounded-full border-2 border-red-500 text-red-700 font-black text-xs uppercase tracking-wide disabled:opacity-50"
            >
              {busyId === 'ALL'
                ? 'Purging all…'
                : `Purge all ${data.total_photos} photos across ${data.total_archived} auctions`}
            </button>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y divide-gray-100 overflow-hidden">
              {data.auctions.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-brand-navy truncate">
                      {row.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {row.lot_count} lots · {row.photo_count} photos ·
                      archived{' '}
                      {new Date(row.archived_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    onClick={() => purgeOne(row)}
                    disabled={!!busyId || row.photo_count === 0}
                    className="text-xs font-bold text-red-600 whitespace-nowrap disabled:opacity-40"
                  >
                    {busyId === row.id ? 'Purging…' : 'Purge photos'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
