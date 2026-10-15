'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Header from '@/components/Header';

interface Stats {
  totalItems: number;
  totalAuctions: number;
  auctionsCrawled: number;
  auctionsPending: number;
  lastIndexedAt: string | null;
}

export default function AFArchiveAdminPage() {
  const supabase = createClient();
  const [stats, setStats] = useState<Stats | null>(null);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [log, setLog] = useState<string[]>([]);
  const [cursor, setCursor] = useState<{ page: number; offset: number } | null>(null);

  const refreshStats = async () => {
    const [itemsRes, aucsRes, lastRes] = await Promise.all([
      supabase.from('af_archive_items').select('id', { count: 'exact', head: true }),
      supabase.from('af_archive_auctions').select('af_auction_id, last_crawled_at'),
      supabase
        .from('af_archive_items')
        .select('indexed_at')
        .order('indexed_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const aucs = aucsRes.data || [];
    setStats({
      totalItems: itemsRes.count || 0,
      totalAuctions: aucs.length,
      auctionsCrawled: aucs.filter((a: any) => a.last_crawled_at).length,
      auctionsPending: aucs.filter((a: any) => !a.last_crawled_at).length,
      lastIndexedAt: lastRes.data?.indexed_at || null,
    });
  };

  useEffect(() => {
    refreshStats();
    const t = setInterval(refreshStats, 5000);
    return () => clearInterval(t);
  }, []);

  const runOnce = async (fromPage: number, skipKnown: boolean, maxAuctions = 5) => {
    const res = await fetch('/api/admin/af-archive-reindex', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromPage, pagesToProcess: 10, skipKnown, maxAuctions }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status}: ${body.substring(0, 200)}`);
    }
    return res.json();
  };

  const runUntilDone = async (mode: 'refresh' | 'full') => {
    setRunning(true);
    setLog([]);
    setStatus('Starting…');
    try {
      let page = 0;
      const skipKnown = mode === 'refresh';
      const safetyCap = 100; // ~100 calls × 5 auctions = 500 auctions, way beyond AF's 200
      for (let i = 0; i < safetyCap; i++) {
        setStatus(`Crawling page ${page}… (call ${i + 1})`);
        const r = await runOnce(page, skipKnown, 5);
        setLog((l) => [
          `page ${page}: ${r.auctions_crawled} crawled, ${r.auctions_skipped} skipped, ${r.lots_upserted} lots upserted, ${r.errors.length} errors`,
          ...l,
        ]);
        await refreshStats();
        if (r.next_page == null) break;
        page = r.next_page;
      }
      setStatus('Done.');
    } catch (err: any) {
      setStatus(`Failed: ${err?.message || String(err)}`);
    } finally {
      setRunning(false);
      setCursor(null);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header title="AF Archive Index" backHref="/admin" />
      <div className="p-4 space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-black text-brand-navy uppercase tracking-wide text-sm mb-3">
            Index Stats
          </h2>
          {stats ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <Stat label="Lots indexed" value={stats.totalItems.toLocaleString()} />
              <Stat label="Auctions seen" value={stats.totalAuctions.toLocaleString()} />
              <Stat label="Crawled" value={stats.auctionsCrawled.toLocaleString()} />
              <Stat
                label="Pending crawl"
                value={stats.auctionsPending.toLocaleString()}
                emphasis={stats.auctionsPending > 0}
              />
            </div>
          ) : (
            <p className="text-xs text-gray-400">Loading…</p>
          )}
          {stats?.lastIndexedAt && (
            <p className="text-xs text-gray-400 mt-3">
              Last upsert: {new Date(stats.lastIndexedAt).toLocaleString()}
            </p>
          )}
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 space-y-3">
          <h2 className="font-black text-brand-navy uppercase tracking-wide text-sm">
            Reindex
          </h2>
          <p className="text-xs text-gray-500">
            The stock-image search queries this table FIRST. Prior AF photos
            are the best match — same brand, same model, same photo quality.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={() => runUntilDone('refresh')}
              disabled={running}
              className="rounded-lg bg-brand-blue text-white font-black uppercase tracking-wide py-3 disabled:opacity-50"
            >
              Nightly Refresh (new auctions only)
            </button>
            <button
              onClick={() => runUntilDone('full')}
              disabled={running}
              className="rounded-lg bg-brand-navy text-white font-black uppercase tracking-wide py-3 disabled:opacity-50"
            >
              Full Recrawl (all 200 past auctions)
            </button>
          </div>
          <p className="text-[11px] text-gray-400 leading-snug">
            Full recrawl takes several minutes (one call per ~5 auctions,
            auto-looped from this page). Safe to close the tab — any
            auctions already in-progress will finish server-side; the next
            open of this page resumes bookkeeping.
          </p>
          {status && (
            <p className="text-xs font-bold text-brand-navy">{status}</p>
          )}
        </div>

        {log.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h2 className="font-black text-brand-navy uppercase tracking-wide text-sm mb-2">
              Run Log
            </h2>
            <ul className="text-xs text-gray-600 space-y-1 font-mono">
              {log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`font-black text-xl ${emphasis ? 'text-brand-blue' : 'text-brand-navy'}`}>
        {value}
      </p>
    </div>
  );
}
