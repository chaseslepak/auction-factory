'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Header from '@/components/Header';
import GradientButton from '@/components/GradientButton';
import ProgressBar from '@/components/ProgressBar';

interface ScannedLot {
  af_auction_id: number;
  af_item_id: number;
  lot_number: number | null;
  item_name: string | null;
  brand: string | null;
  model: string | null;
  condition_rating: string | null;
  retail_new: number | null;
  sold_price: number | null;
  image_url: string | null;
  lot_href: string;
}

// Pull the AF auction id out of whatever Chase pastes — a full URL
// (archive_auction_details.php?auction=4967), a short bare id, or the
// buyer page URL. Returns null if nothing parses.
function parseAfAuctionId(input: string): number | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const m = trimmed.match(/[?&]auction=(\d+)/);
  if (m) return Number(m[1]);
  return null;
}

function cond(l: ScannedLot): string {
  return (l.condition_rating || '').trim();
}

export default function ImportFromArchivePage() {
  const { id: destAuctionId } = useParams<{ id: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [destAuctionName, setDestAuctionName] = useState<string>('');
  const [nextDestLotNumber, setNextDestLotNumber] = useState<number>(1);

  // Source: AF archive auction to pull from.
  const [sourceInput, setSourceInput] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<ScannedLot[]>([]);
  const [sourceAfAuctionId, setSourceAfAuctionId] = useState<number | null>(null);

  // Picking: set of af_item_ids selected for import.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');

  // Destination numbering.
  const [startLotNumber, setStartLotNumber] = useState<number>(1);

  // Execution.
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [resultIsError, setResultIsError] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: a } = await supabase
        .from('auctions')
        .select('name')
        .eq('id', destAuctionId)
        .single();
      if (a) setDestAuctionName(a.name || '');
      const { data: maxRow } = await supabase
        .from('lots')
        .select('lot_number')
        .eq('auction_id', destAuctionId)
        .is('deleted_at', null)
        .order('lot_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      const next = ((maxRow as any)?.lot_number ?? 0) + 1;
      setNextDestLotNumber(next);
      setStartLotNumber(next);
    })();
  }, [supabase, destAuctionId]);

  const handleScan = async () => {
    setScanError(null);
    setScanned([]);
    setSelected(new Set());
    const afId = parseAfAuctionId(sourceInput);
    if (!afId) {
      setScanError("Couldn't read an AF auction id from that input. Paste the archive URL or just the auction number.");
      return;
    }
    setSourceAfAuctionId(afId);
    setScanning(true);
    try {
      const res = await fetch('/api/import-archive/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ af_auction_id: afId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `scan failed: ${res.status}`);
      setScanned(data.lots || []);
      if (!data.lots?.length) {
        setScanError('No lots found on that AF auction page — check the id / URL.');
      }
    } catch (err: any) {
      setScanError(err?.message || String(err));
    } finally {
      setScanning(false);
    }
  };

  const toggle = (afItemId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(afItemId)) next.delete(afItemId);
      else next.add(afItemId);
      return next;
    });
  };
  const selectAll = () => setSelected(new Set(scanned.map((l) => l.af_item_id)));
  const clearAll = () => setSelected(new Set());
  const applyRange = () => {
    const from = Number(rangeFrom);
    const to = Number(rangeTo);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from < 1 || to < from) return;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const l of scanned) {
        if (l.lot_number != null && l.lot_number >= from && l.lot_number <= to) {
          next.add(l.af_item_id);
        }
      }
      return next;
    });
  };

  // Build ordered id list from selection, sorted by source lot_number
  // so the destination numbering preserves the source order.
  const orderedSelection = useMemo(() => {
    return scanned
      .filter((l) => selected.has(l.af_item_id))
      .sort((a, b) => (a.lot_number ?? 0) - (b.lot_number ?? 0));
  }, [scanned, selected]);

  const handleImport = async () => {
    if (orderedSelection.length === 0) return;
    if (!sourceAfAuctionId) return;
    setImporting(true);
    setResultMsg(null);
    setResultIsError(false);
    // Server caps at 10 per batch to stay under Vercel function timeout
    // on photo-heavy lots. Chunk the selection and submit sequentially.
    const BATCH = 10;
    const idsAll = orderedSelection.map((l) => l.af_item_id);
    setProgress({ current: 0, total: idsAll.length });
    let created = 0;
    let errors = 0;
    let currentStart = startLotNumber;
    try {
      for (let i = 0; i < idsAll.length; i += BATCH) {
        const chunk = idsAll.slice(i, i + BATCH);
        const res = await fetch('/api/import-archive/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auction_id: destAuctionId,
            af_auction_id: sourceAfAuctionId,
            start_lot_number: currentStart,
            af_item_ids: chunk,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || `execute failed: ${res.status}`);
        created += data.created || 0;
        errors += (data.results || []).filter((r: any) => !r.success).length;
        currentStart += chunk.length;
        setProgress({ current: Math.min(idsAll.length, i + chunk.length), total: idsAll.length });
      }
      if (errors > 0) {
        setResultIsError(true);
        setResultMsg(
          `Imported ${created} of ${idsAll.length} lots. ${errors} failed — check lotter for gaps and retry those lot numbers individually.`,
        );
      } else {
        setResultMsg(`Imported ${created} lots. Returning to auction…`);
        setTimeout(() => router.push(`/auctions/${destAuctionId}`), 1200);
      }
    } catch (err: any) {
      setResultIsError(true);
      setResultMsg(err?.message || String(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <Header title="Import from AF Archive" backHref={`/auctions/${destAuctionId}`} />
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div>
          <Link
            href={`/auctions/${destAuctionId}`}
            className="text-xs text-brand-blue font-bold uppercase tracking-wide"
          >
            ← Back to {destAuctionName || 'auction'}
          </Link>
          <h1 className="text-2xl font-black mt-2">Import from AF archive</h1>
          <p className="text-sm text-gray-500 mt-1">
            Pulls lots from a published AF auction (with every photo) into this one.
            Destination: <span className="font-bold">{destAuctionName || destAuctionId}</span> (next free lot # = {nextDestLotNumber}).
          </p>
        </div>

        {/* Source + scan */}
        <div className="border rounded-xl p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Source AF auction</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={sourceInput}
              onChange={(e) => setSourceInput(e.target.value)}
              placeholder="Paste https://auctionfactory.com/archive_auction_details.php?auction=NNNN or just the number"
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-blue"
            />
            <button
              onClick={handleScan}
              disabled={scanning || !sourceInput.trim()}
              className="px-4 py-2 rounded-lg bg-brand-blue text-white font-bold text-xs uppercase tracking-wide disabled:opacity-50"
            >
              {scanning ? 'Scanning…' : 'Load lots'}
            </button>
          </div>
          {scanError && <p className="text-xs text-red-500">{scanError}</p>}
        </div>

        {/* Pick + destination numbering */}
        {scanned.length > 0 && (
          <div className="border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Pick lots ({selected.size} selected of {scanned.length})
              </div>
              <div className="flex gap-2 items-center">
                <button
                  onClick={selectAll}
                  className="text-xs underline text-brand-blue"
                >Select all</button>
                <button
                  onClick={clearAll}
                  className="text-xs underline text-gray-500"
                >Clear</button>
                <input
                  type="number"
                  min={1}
                  value={rangeFrom}
                  onChange={(e) => setRangeFrom(e.target.value)}
                  placeholder="from"
                  className="w-16 px-2 py-1 rounded border border-gray-200 text-xs"
                />
                <input
                  type="number"
                  min={1}
                  value={rangeTo}
                  onChange={(e) => setRangeTo(e.target.value)}
                  placeholder="to"
                  className="w-16 px-2 py-1 rounded border border-gray-200 text-xs"
                />
                <button
                  onClick={applyRange}
                  className="text-xs underline text-brand-blue"
                >Add range</button>
              </div>
            </div>

            <div className="border rounded-lg divide-y max-h-[520px] overflow-auto">
              {scanned.map((l) => {
                const isPicked = selected.has(l.af_item_id);
                return (
                  <label
                    key={l.af_item_id}
                    className={`flex items-center gap-3 px-3 py-2 cursor-pointer ${isPicked ? 'bg-brand-blue/5' : ''}`}
                  >
                    <input
                      type="checkbox"
                      checked={isPicked}
                      onChange={() => toggle(l.af_item_id)}
                    />
                    <span className="w-12 text-xs font-mono text-gray-600">#{l.lot_number ?? '?'}</span>
                    {l.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={l.image_url}
                        alt=""
                        className="w-14 h-14 object-cover rounded border border-gray-200"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded bg-gray-100" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{l.item_name || '(no title)'}</div>
                      <div className="text-xs text-gray-500 truncate">
                        {[l.brand, l.model].filter(Boolean).join(' / ') || '—'}
                        {cond(l) ? ` · cond ${cond(l)}` : ''}
                        {l.retail_new ? ` · retail $${l.retail_new.toLocaleString()}` : ''}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex items-center justify-between flex-wrap gap-3 pt-2">
              <label className="flex items-center gap-2 text-sm">
                Starting lot # in destination:
                <input
                  type="number"
                  min={1}
                  value={startLotNumber}
                  onChange={(e) => setStartLotNumber(Math.max(1, Number(e.target.value) || 1))}
                  className="w-24 px-2 py-1 rounded border border-gray-200 text-sm"
                />
              </label>
              <GradientButton
                onClick={handleImport}
                loading={importing}
                disabled={orderedSelection.length === 0}
              >
                Import {orderedSelection.length || ''} lot{orderedSelection.length === 1 ? '' : 's'}
              </GradientButton>
            </div>
            {importing && progress.total > 0 && (
              <ProgressBar current={progress.current} total={progress.total} label="Importing" />
            )}
            {resultMsg && (
              <p className={`text-sm ${resultIsError ? 'text-red-500' : 'text-brand-green'}`}>
                {resultMsg}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
