'use client';

// One-time reconciliation sweep page.
//
// Walks every auction, pulls AF's admin item list, backfills
// lots.af_item_id for any pre-phase15 lot whose title matches
// unambiguously. Idempotent — safe to click multiple times.
//
// After running once, every auction should show matched + ambiguous +
// unmatched = scanned. Ambiguous rows need manual fixing (duplicate
// titles on the same AF auction); unmatched rows are lots that no
// longer exist on AF (deleted) or whose title drifted after upload.

import { useState } from 'react';
import Header from '@/components/Header';

type AuctionRow = {
  auction_id: string;
  af_auction_id: string;
  title: string | null;
  scanned: number;
  matched: number;
  ambiguous: number;
  unmatched: number;
  note?: string;
};

export default function BackfillPage() {
  const [running, setRunning] = useState(false);
  const [totalMatched, setTotalMatched] = useState<number | null>(null);
  const [auctions, setAuctions] = useState<AuctionRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setTotalMatched(null);
    setAuctions([]);
    try {
      const res = await fetch('/api/admin/backfill-af-item-id', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error || `HTTP ${res.status}`);
      } else {
        setTotalMatched(body.totalMatched);
        setAuctions(body.auctions || []);
      }
    } catch (err: any) {
      setError(err?.message || 'Network error');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header title="AF Item ID Backfill" backHref="/admin" />
      <div className="p-4 space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-2">
            Pre-phase15 drift cleanup
          </h2>
          <p className="text-xs text-gray-500 leading-snug">
            Lots pushed before af_item_id capture shipped still have a
            fragile lot_number join. This walks every auction, pulls AF's
            admin item list, and backfills af_item_id wherever the title
            matches unambiguously. Safe to re-run — only fills blanks on
            exact single matches. Ambiguous titles and unmatched lots are
            reported but not changed.
          </p>
          <button
            onClick={run}
            disabled={running}
            className="mt-3 w-full bg-brand-blue text-white font-bold py-2 rounded disabled:opacity-40"
          >
            {running ? 'Running — this takes a few minutes…' : 'Run reconciliation sweep'}
          </button>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
          {totalMatched != null && (
            <p className="text-xs text-brand-green font-bold mt-3">
              Backfilled {totalMatched.toLocaleString()} lots across {auctions.length} auctions.
            </p>
          )}
        </div>

        {auctions.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-3">
              Per-auction results
            </h2>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 uppercase tracking-wide">
                  <th className="pb-2">Auction</th>
                  <th className="pb-2 text-right">Scanned</th>
                  <th className="pb-2 text-right text-brand-green">Matched</th>
                  <th className="pb-2 text-right text-amber-600">Ambiguous</th>
                  <th className="pb-2 text-right text-red-500">Unmatched</th>
                  <th className="pb-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {auctions.map((r) => (
                  <tr key={r.auction_id} className="border-t border-gray-100">
                    <td className="py-2 truncate max-w-[200px]">
                      {r.title || `AF #${r.af_auction_id}`}
                    </td>
                    <td className="py-2 text-right font-mono">{r.scanned}</td>
                    <td className="py-2 text-right font-mono text-brand-green font-bold">{r.matched}</td>
                    <td className="py-2 text-right font-mono text-amber-600">{r.ambiguous}</td>
                    <td className="py-2 text-right font-mono text-red-500">{r.unmatched}</td>
                    <td className="py-2 text-[10px] text-gray-400 truncate max-w-[200px]">
                      {r.note || ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
