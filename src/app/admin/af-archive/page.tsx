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

  const runOnce = async (fromPage: number, skipKnown: boolean, maxAuctions = 3) => {
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

  // Retry a 504 / 502 / network blip up to N times with backoff. A single
  // dropped call shouldn't torpedo the whole crawl — the server-side
  // bookkeeping lets us pick back up at the same cursor.
  const runOnceWithRetry = async (
    fromPage: number,
    skipKnown: boolean,
    maxAuctions: number,
    maxRetries = 3
  ) => {
    let lastErr: any = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await runOnce(fromPage, skipKnown, maxAuctions);
      } catch (err: any) {
        lastErr = err;
        const msg = String(err?.message || err);
        const isTransient = /^(5\d\d|FUNCTION_INVOCATION_TIMEOUT|network|fetch failed|aborted)/i.test(msg);
        if (!isTransient || attempt === maxRetries) throw err;
        const backoff = 2000 * (attempt + 1);
        setStatus(`Transient error (${msg.substring(0, 60)}…) — retrying in ${backoff / 1000}s`);
        await new Promise((r) => setTimeout(r, backoff));
      }
    }
    throw lastErr;
  };

  const runUntilDone = async (mode: 'refresh' | 'full') => {
    setRunning(true);
    setLog([]);
    setStatus('Starting…');
    try {
      let page = 0;
      const skipKnown = mode === 'refresh';
      // ~200 past auctions ÷ 3 auctions/call = ~67 calls to walk the
      // whole archive on a full recrawl. Allow 150 calls to cover
      // retries and the odd mid-stream failure.
      const safetyCap = 150;
      for (let i = 0; i < safetyCap; i++) {
        setStatus(`Crawling page ${page}… (call ${i + 1})`);
        try {
          const r = await runOnceWithRetry(page, skipKnown, 3);
          setLog((l) => [
            `page ${page}: ${r.auctions_crawled} crawled, ${r.auctions_skipped} skipped, ${r.lots_upserted} lots upserted, ${r.errors.length} errors`,
            ...l,
          ]);
          await refreshStats();
          if (r.next_page == null) break;
          page = r.next_page;
        } catch (err: any) {
          // Persistent failure on a single call. Advance the page cursor
          // past it so we don't infinite-loop on a bad auction — the
          // bookkeeping table will show its last_crawl_error for Chase
          // to inspect. If this was the last page, break; otherwise
          // continue with the next.
          setLog((l) => [
            `page ${page}: FAILED after retries — ${err?.message || String(err)}; skipping to next page`,
            ...l,
          ]);
          page = page + 1;
        }
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
