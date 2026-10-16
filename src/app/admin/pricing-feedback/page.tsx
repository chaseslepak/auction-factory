'use client';

// Pricing feedback loop admin page.
//
// Shows how Chase's listed prices compare to actual hammer prices on
// AF after auctions close. Data comes from af_archive_items where
// both retail_new (what Chase listed it at × markup) and sold_price
// (hammer bid) are known.
//
// Three views in one page:
//   - Headline: overall sold/listed ratio across the archive. 0.8
//     means items hammer at 80% of listed on average.
//   - By brand: top 10 brands by delta magnitude. Flags brands where
//     Chase is chronically mispricing in either direction.
//   - Worst 20: individual lots where sold vs listed delta was
//     biggest. Click an af_item_id to open on AF.

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import Header from '@/components/Header';

type Row = {
  af_item_id: number;
  item_name: string | null;
  brand: string | null;
  model: string | null;
  retail_new: number | null;
  sold_price: number | null;
  auction_title: string | null;
  auction_closed_at: string | null;
  lot_href: string;
};

export default function PricingFeedbackPage() {
  const supabase = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [windowDays, setWindowDays] = useState(90);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('af_archive_items')
        .select('af_item_id, item_name, brand, model, retail_new, sold_price, auction_title, auction_closed_at, lot_href')
        .not('sold_price', 'is', null)
        .not('retail_new', 'is', null)
        .gt('retail_new', 0)
        .gt('sold_price', 0)
        .gte('auction_closed_at', since)
        .limit(5000);
      setRows((data || []) as Row[]);
      setLoading(false);
    })();
  }, [windowDays]);

  // Headline: median sold/listed ratio. Median beats mean because a
  // handful of 10x outliers (an item we underpriced that went viral)
  // can swing a mean dramatically.
  const ratios = rows
    .map((r) => (r.retail_new! > 0 ? (r.sold_price! / r.retail_new!) : null))
    .filter((n): n is number => n != null && Number.isFinite(n) && n > 0 && n < 10);
  const sortedRatios = [...ratios].sort((a, b) => a - b);
  const medianRatio = sortedRatios.length > 0
    ? sortedRatios[Math.floor(sortedRatios.length / 2)]
    : null;
  const meanRatio = ratios.length > 0
    ? ratios.reduce((s, r) => s + r, 0) / ratios.length
    : null;

  // By brand: aggregate ratios per brand, show top 10 by sample count.
  // Low sample count brands are noisy; show count so Chase can decide.
  const brandAgg: Record<string, { count: number; sum: number; ratios: number[]; name: string }> = {};
  for (const r of rows) {
    const brand = (r.brand || '').trim();
    if (!brand || !r.retail_new || !r.sold_price) continue;
    const ratio = r.sold_price / r.retail_new;
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 10) continue;
    const key = brand.toLowerCase();
    const slot = brandAgg[key] || { count: 0, sum: 0, ratios: [], name: brand };
    slot.count++;
    slot.sum += ratio;
    slot.ratios.push(ratio);
    brandAgg[key] = slot;
  }
  const brandRows = Object.values(brandAgg)
    .filter((b) => b.count >= 3)
    .map((b) => {
      const sorted = [...b.ratios].sort((a, c) => a - c);
      const med = sorted[Math.floor(sorted.length / 2)];
      return { name: b.name, count: b.count, median: med, mean: b.sum / b.count };
    })
    .sort((a, b) => Math.abs(a.median - 1) - Math.abs(b.median - 1))
    .reverse()
    .slice(0, 15);

  // Worst 20 deltas — absolute dollar amount, not ratio. A $5000 →
  // $100 miss hurts the bottom line more than a $20 → $2 miss even
  // though the ratio is the same.
  const worst = rows
    .filter((r) => r.retail_new && r.sold_price && r.retail_new > r.sold_price)
    .map((r) => ({ ...r, delta: r.retail_new! - r.sold_price! }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 20);

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header title="Pricing Feedback" backHref="/admin" />
      <div className="p-4 space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide">
              Window
            </h2>
            <select
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
              className="text-sm border border-gray-200 rounded px-2 py-1"
            >
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
              <option value={180}>Last 180 days</option>
              <option value={365}>Last year</option>
            </select>
          </div>
          {loading ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-xs text-gray-400">
              No sold-price data yet. Nightly cron populates this as auctions close and are re-crawled; manually trigger a Full Recrawl in /admin/af-archive to backfill.
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <Stat label="Sampled items" value={rows.length.toLocaleString()} />
              <Stat
                label="Median sold/listed"
                value={medianRatio != null ? `${Math.round(medianRatio * 100)}%` : '—'}
                emphasis={medianRatio != null && medianRatio < 0.5}
              />
              <Stat
                label="Mean sold/listed"
                value={meanRatio != null ? `${Math.round(meanRatio * 100)}%` : '—'}
              />
              <Stat
                label="Brand groups"
                value={brandRows.length.toLocaleString()}
              />
            </div>
          )}
          <p className="text-[11px] text-gray-500 mt-3 leading-snug">
            Sold/listed ratio = hammer price ÷ what Chase listed it at
            (retail × 1.10 markup). A median below ~60% means the lotter
            is systematically overpricing — items hammer well under
            their listed price. A median above ~90% means we may be
            leaving money on the table.
          </p>
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-3">
            Brands with the biggest listed vs sold gap
          </h2>
          {brandRows.length === 0 ? (
            <p className="text-xs text-gray-400">Need at least 3 sold samples per brand to show stats.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 uppercase tracking-wide">
                  <th className="pb-2">Brand</th>
                  <th className="pb-2 text-right">Samples</th>
                  <th className="pb-2 text-right">Median sold/listed</th>
                  <th className="pb-2 text-right">Mean</th>
                  <th className="pb-2 text-right">Signal</th>
                </tr>
              </thead>
              <tbody>
                {brandRows.map((b) => (
                  <tr key={b.name} className="border-t border-gray-100">
                    <td className="py-2 font-bold">{b.name}</td>
                    <td className="py-2 text-right text-gray-500">{b.count}</td>
                    <td className="py-2 text-right font-mono">
                      {Math.round(b.median * 100)}%
                    </td>
                    <td className="py-2 text-right text-gray-500 font-mono">
                      {Math.round(b.mean * 100)}%
                    </td>
                    <td className="py-2 text-right text-xs">
                      {b.median < 0.4 ? (
                        <span className="text-red-500 font-bold">overpriced</span>
                      ) : b.median > 1.3 ? (
                        <span className="text-brand-blue font-bold">underpriced</span>
                      ) : (
                        <span className="text-gray-400">in range</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-3">
            Worst 20 individual deltas (listed − sold)
          </h2>
          {worst.length === 0 ? (
            <p className="text-xs text-gray-400">No overpriced items in window.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-400 uppercase tracking-wide">
                  <th className="pb-2">Item</th>
                  <th className="pb-2 text-right">Listed</th>
                  <th className="pb-2 text-right">Sold</th>
                  <th className="pb-2 text-right">Delta</th>
                  <th className="pb-2">Auction</th>
                  <th className="pb-2"></th>
                </tr>
              </thead>
              <tbody>
                {worst.map((r) => (
                  <tr key={r.af_item_id} className="border-t border-gray-100">
                    <td className="py-2 max-w-[280px] truncate">{r.item_name || '(no name)'}</td>
                    <td className="py-2 text-right font-mono">${r.retail_new?.toLocaleString()}</td>
                    <td className="py-2 text-right font-mono">${r.sold_price?.toLocaleString()}</td>
                    <td className="py-2 text-right font-mono text-red-500 font-bold">
                      −${r.delta.toLocaleString()}
                    </td>
                    <td className="py-2 text-gray-500 truncate max-w-[160px]">
                      {r.auction_title || '—'}
                    </td>
                    <td className="py-2">
                      <a
                        href={r.lot_href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-brand-blue text-xs font-bold"
                      >
                        open
                      </a>
                    </td>
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
