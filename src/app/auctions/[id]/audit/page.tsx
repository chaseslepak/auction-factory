'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import GradientButton from '@/components/GradientButton';

interface AuditResult {
  auction_name: string;
  af_auction_id: string;
  af_url: string;
  counts: { lotter_lots: number; af_lots: number };
  only_in_lotter: Array<{
    lot_number: number;
    item_name: string;
    af_upload_status: string | null;
  }>;
  only_in_af: Array<{ lot_number: number; title: string; af_item_url: string }>;
  duplicates_in_af: Array<{ lot_number: number; count: number; titles: string[] }>;
  possible_name_mismatches: Array<{
    lot_number: number;
    lotter_item: string;
    af_titles: string[];
  }>;
}

export default function AuditPage() {
  const { id } = useParams<{ id: string }>();
  const [result, setResult] = useState<AuditResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runAudit = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/audit-auction/${id}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `HTTP ${res.status}`);
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runAudit();
  }, [id]);

  return (
    <div className="min-h-screen bg-brand-bg pb-12">
      <Header title="Audit AF vs Lotter" backHref={`/auctions/${id}`} />

      <div className="p-4 space-y-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500">
            Fetches the linked AF auction and compares its lots against this
            auction&apos;s lots in the lotter. Read-only — nothing is changed.
          </p>
          <div className="mt-3">
            <GradientButton onClick={runAudit} loading={loading}>
              {loading ? 'Auditing…' : 'Re-run audit'}
            </GradientButton>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-4">
            {error}
          </div>
        )}

        {result && (
          <>
            <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
              <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-2">
                {result.auction_name}
              </h3>
              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">Lotter</p>
                  <p className="text-xl font-black text-brand-navy">
                    {result.counts.lotter_lots}
                  </p>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 uppercase">AF Live</p>
                  <p className="text-xl font-black text-brand-navy">
                    {result.counts.af_lots}
                  </p>
                </div>
              </div>
              <a
                href={result.af_url}
                target="_blank"
                rel="noreferrer"
                className="block mt-3 text-xs text-brand-blue underline text-center"
              >
                View AF auction →
              </a>
            </div>

            <Section
              title={`Only on AF (${result.only_in_af.length})`}
              subtitle="Lots present on Auction Factory but missing in the lotter — likely duplicate uploads or manual additions on AF."
              empty="None — no orphan lots on AF"
              variant="danger"
            >
              {result.only_in_af.map((lot) => (
                <Row key={`af-${lot.lot_number}`}>
                  <span className="font-mono text-xs w-14">#{lot.lot_number}</span>
                  <span className="flex-1 truncate">{lot.title}</span>
                  <a
                    href={lot.af_item_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-brand-blue text-xs"
                  >
                    open ↗
                  </a>
                </Row>
              ))}
            </Section>

            <Section
              title={`Duplicates on AF (${result.duplicates_in_af.length})`}
              subtitle="Same lot number posted more than once on AF."
              empty="None"
              variant="warning"
            >
              {result.duplicates_in_af.map((dup) => (
                <Row key={`dup-${dup.lot_number}`}>
                  <span className="font-mono text-xs w-14">#{dup.lot_number}</span>
                  <div className="flex-1">
                    <p className="text-xs text-gray-500">{dup.count} copies</p>
                    <p className="truncate text-sm">{dup.titles.join(' | ')}</p>
                  </div>
                </Row>
              ))}
            </Section>

            <Section
              title={`Only in lotter (${result.only_in_lotter.length})`}
              subtitle="Lots present in the lotter but not on AF — failed uploads or lots that need to be re-uploaded."
              empty="None — everything in the lotter is on AF"
              variant="warning"
            >
              {result.only_in_lotter.map((lot) => (
                <Row key={`lot-${lot.lot_number}`}>
                  <span className="font-mono text-xs w-14">#{lot.lot_number}</span>
                  <span className="flex-1 truncate">{lot.item_name}</span>
                  <span className="text-xs text-gray-500">
                    {lot.af_upload_status || 'never sent'}
                  </span>
                </Row>
              ))}
            </Section>

            <Section
              title={`Possible name mismatches (${result.possible_name_mismatches.length})`}
              subtitle="Same lot number exists on both sides but the item names don't overlap. Check manually — could be normal wording differences or a real content mismatch."
              empty="None"
              variant="warning"
            >
              {result.possible_name_mismatches.map((m) => (
                <Row key={`mm-${m.lot_number}`}>
                  <span className="font-mono text-xs w-14">#{m.lot_number}</span>
                  <div className="flex-1">
                    <p className="text-xs text-gray-500">Lotter: {m.lotter_item}</p>
                    <p className="text-xs text-gray-500">
                      AF: {m.af_titles.join(' | ')}
                    </p>
                  </div>
                </Row>
              ))}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  empty,
  variant,
  children,
}: {
  title: string;
  subtitle: string;
  empty: string;
  variant: 'danger' | 'warning';
  children: React.ReactNode;
}) {
  const kids = Array.isArray(children) ? children : [children];
  const hasContent = kids.filter(Boolean).length > 0;
  const badgeColor = variant === 'danger' ? 'bg-red-500' : 'bg-yellow-500';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${badgeColor}`} />
          <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide">
            {title}
          </h3>
        </div>
        <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
      </div>
      {hasContent ? (
        <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
          {children}
        </div>
      ) : (
        <p className="text-xs text-gray-400 p-4 text-center">{empty}</p>
      )}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 p-3 text-sm text-brand-navy">
      {children}
    </div>
  );
}
