'use client';

// Purge "IMAGE COMING SOON" placeholder photos from an auction.
//
// Vendor sites (Libbey, Webstaurant, etc.) sometimes serve a generic
// placeholder when a product isn't in their catalog yet. Our stock-
// image search downloads and saves it. AF then rejects the push with
// "Photo upload needs attention". This tool uses Claude vision to
// classify each photo in a given auction and deletes the ones that
// read as placeholders.
//
// Workflow: paste the lotter auction UUID, dry-run first to review
// what would be deleted, then run for real.

import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';

type Flagged = {
  lot_id: string;
  lot_number: number | null;
  item_name: string | null;
  photo_id: string;
  storage_path: string;
  deleted: boolean;
};

export default function PurgePlaceholdersPage() {
  const [auctionId, setAuctionId] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    dry_run: boolean;
    scanned: number;
    kept: number;
    flagged_count: number;
    flagged: Flagged[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    if (!auctionId.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/admin/purge-placeholder-photos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auction_id: auctionId.trim(), dry_run: dryRun }),
      });
      const body = await res.json();
      if (!res.ok) setError(body?.error || `HTTP ${res.status}`);
      else setResult(body);
    } catch (err: any) {
      setError(err?.message || 'Network error');
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header title="Purge Placeholders" backHref="/admin" />
      <div className="p-4 space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-2">
            Clean up vendor placeholder photos
          </h2>
          <p className="text-xs text-gray-500 leading-snug mb-3">
            Vendor sites sometimes serve a generic &quot;IMAGE COMING SOON&quot;
            graphic when a product isn&apos;t in their catalog. AF rejects
            lots with those as primary photo. This scans an auction with
            Claude vision and deletes any photo it classifies as a
            placeholder. Dry-run first.
          </p>
          <input
            type="text"
            value={auctionId}
            onChange={(e) => setAuctionId(e.target.value)}
            placeholder="Lotter auction UUID"
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm font-mono mb-2"
          />
          <div className="flex gap-2">
            <button
              onClick={() => run(true)}
              disabled={loading || !auctionId.trim()}
              className="flex-1 text-xs font-bold text-brand-blue border border-brand-blue/30 rounded py-2 disabled:opacity-40"
            >
              {loading ? 'Scanning…' : 'Dry run (safe)'}
            </button>
            <button
              onClick={() => {
                if (!confirm('Permanently delete flagged photos? This cannot be undone.')) return;
                run(false);
              }}
              disabled={loading || !auctionId.trim()}
              className="flex-1 text-xs font-bold text-white bg-red-500 rounded py-2 disabled:opacity-40"
            >
              {loading ? 'Working…' : 'Purge for real'}
            </button>
          </div>
          {error && <p className="text-xs text-red-500 mt-3">{error}</p>}
        </div>

        {result && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-2">
              Result {result.dry_run ? '(dry run)' : '(DELETED)'}
            </h3>
            <div className="grid grid-cols-3 gap-2 text-center mb-3">
              <div>
                <p className="text-[10px] uppercase text-gray-400">Scanned</p>
                <p className="font-black text-brand-navy">{result.scanned}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Kept</p>
                <p className="font-black text-brand-green">{result.kept}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase text-gray-400">Flagged</p>
                <p className={`font-black ${result.flagged_count > 0 ? 'text-red-500' : 'text-gray-300'}`}>
                  {result.flagged_count}
                </p>
              </div>
            </div>
            {result.flagged.length > 0 && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-400 uppercase tracking-wide">
                    <th className="pb-2">Lot</th>
                    <th className="pb-2">Item</th>
                    <th className="pb-2 text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.flagged.map((f) => (
                    <tr key={f.photo_id} className="border-t border-gray-100">
                      <td className="py-2">#{f.lot_number ?? '?'}</td>
                      <td className="py-2 truncate max-w-[320px]">
                        {f.item_name || '(no name)'}
                      </td>
                      <td className="py-2 text-right">
                        {result.dry_run ? (
                          <span className="text-amber-600 font-bold">would delete</span>
                        ) : f.deleted ? (
                          <span className="text-brand-green font-bold">deleted</span>
                        ) : (
                          <span className="text-red-500 font-bold">delete failed</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {!result.dry_run && result.flagged_count > 0 && (
              <p className="text-xs text-gray-500 mt-3">
                Re-run &quot;Find Stock Images&quot; on affected lots to replace them, or add photos manually.{' '}
                <Link href="/admin" className="text-brand-blue underline">
                  Back to admin
                </Link>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
