'use client';

// Reorder photos so user-uploaded photos come first, stock images last.
// Deterministic — no AI involved. Fixes legacy lots where a stock
// placeholder landed as the primary photo. Runs auction-scoped or
// across the whole DB.

import { useState } from 'react';
import Header from '@/components/Header';

export default function ReorderPhotosPage() {
  const [auctionId, setAuctionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    scope: string;
    lots_scanned: number;
    lots_reordered: number;
    photos_moved: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(scopeAll: boolean) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body: any = scopeAll ? {} : { auction_id: auctionId.trim() };
      const res = await fetch('/api/admin/reorder-photos-user-first', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const b = await res.json();
      if (!res.ok) setError(b?.error || `HTTP ${res.status}`);
      else setResult(b);
    } catch (err: any) {
      setError(err?.message || 'Network error');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header title="Reorder Photos: User First" backHref="/admin" />
      <div className="p-4 space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-2">
            Deterministic photo reorder
          </h2>
          <p className="text-xs text-gray-500 leading-snug mb-3">
            Walks every lot and puts user-uploaded photos at positions
            0..N-1 and stock images (/stock_ paths) at the end. Based
            purely on storage_path — no AI, no probability. Guarantees
            AF&apos;s primary photo is always a user warehouse shot when
            one exists. Idempotent — safe to re-run.
          </p>
          <input
            type="text"
            value={auctionId}
            onChange={(e) => setAuctionId(e.target.value)}
            placeholder="Auction UUID (leave blank to scan ALL auctions)"
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-mono mb-2"
          />
          <div className="flex gap-2">
            <button
              onClick={() => run(false)}
              disabled={loading || !auctionId.trim()}
              className="flex-1 text-sm font-bold text-white bg-brand-blue rounded py-2 disabled:opacity-40"
            >
              {loading ? 'Working…' : 'Reorder this auction'}
            </button>
            <button
              onClick={() => {
                if (!confirm('Scan EVERY lot across EVERY auction? Can take a few minutes.')) return;
                run(true);
              }}
              disabled={loading}
              className="flex-1 text-xs font-bold text-brand-navy border border-brand-navy/30 rounded py-2 disabled:opacity-40"
            >
              {loading ? 'Working…' : 'Reorder ALL auctions'}
            </button>
          </div>
          {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
        </div>

        {result && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-2">
              Result
            </h3>
            <p className="text-xs text-gray-500 mb-3">{result.scope}</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] uppercase text-gray-400">Lots scanned</p>
                <p className="font-black text-brand-navy">{result.lots_scanned}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Lots reordered</p>
                <p className="font-black text-brand-green">{result.lots_reordered}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Photos moved</p>
                <p className="font-black text-brand-blue">{result.photos_moved}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
