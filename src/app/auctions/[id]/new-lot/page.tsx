'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import Header from '@/components/Header';
import PhotoGrid from '@/components/PhotoGrid';
import ConditionSlider from '@/components/ConditionSlider';
import GradientButton from '@/components/GradientButton';
import SpeechInput from '@/components/SpeechInput';
import IndeterminateBar from '@/components/IndeterminateBar';
import { setPendingLot } from '@/lib/pending-lot-store';

// Per-lotter persisted "next lot number" so two lotters can work the same
// auction without colliding. Each lotter picks their own starting number
// (e.g. 1 and 500) on their own browser; localStorage advances by 1 after
// each save.
const lotterNextKey = (auctionId: string) => `lotter-next-${auctionId}`;

export default function NewLotPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [photos, setPhotos] = useState<string[]>([]);
  const [condition, setCondition] = useState(5);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextLotNumber, setNextLotNumber] = useState(1);
  const [auctionName, setAuctionName] = useState('');
  const [auctionMaxLot, setAuctionMaxLot] = useState(0);
  const [hasLotterOverride, setHasLotterOverride] = useState(false);
  const [editingStart, setEditingStart] = useState(false);
  const [startInput, setStartInput] = useState('');

  const supabase = createClient();

  useEffect(() => {
    const fetchData = async () => {
      const [auctionRes, lotsRes] = await Promise.all([
        supabase.from('auctions').select('name').eq('id', id).single(),
        supabase
          .from('lots')
          .select('lot_number')
          .eq('auction_id', id)
          .is('deleted_at', null)
          .order('lot_number', { ascending: false })
          .limit(1),
      ]);
      if (auctionRes.data) setAuctionName(auctionRes.data.name);
      const dbNext =
        lotsRes.data && lotsRes.data.length > 0 ? lotsRes.data[0].lot_number + 1 : 1;
      setAuctionMaxLot(dbNext - 1);

      // Prefer this lotter's persisted starting number if set — that's how two
      // lotters keep separate lot-number ranges.
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(lotterNextKey(id));
      } catch {}
      if (stored) {
        const parsed = parseInt(stored, 10);
        if (!Number.isNaN(parsed) && parsed > 0) {
          setNextLotNumber(parsed);
          setHasLotterOverride(true);
          return;
        }
      }
      setNextLotNumber(dbNext);
    };
    fetchData();
  }, [id]);

  const applyStart = () => {
    const parsed = parseInt(startInput, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      setError('Starting lot number must be a positive integer.');
      return;
    }
    try {
      localStorage.setItem(lotterNextKey(id), String(parsed));
    } catch {}
    setNextLotNumber(parsed);
    setHasLotterOverride(true);
    setEditingStart(false);
    setStartInput('');
    setError(null);
  };

  const resetStart = () => {
    try {
      localStorage.removeItem(lotterNextKey(id));
    } catch {}
    setNextLotNumber(auctionMaxLot + 1);
    setHasLotterOverride(false);
    setEditingStart(false);
    setStartInput('');
  };

  const handleGenerate = async () => {
    if (photos.length === 0) {
      setError('Add at least one photo');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/generate-listing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images: photos,
          condition,
          quantity,
          notes,
          auction_name: auctionName,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate listing');
      }

      const listing = await res.json();

      // Photos go through the in-memory store — base64 dataURLs blow past the
      // browser's sessionStorage quota and throw QuotaExceededError.
      setPendingLot({ listing, photos, condition, quantity, notes, nextLotNumber });

      // Keep the small fields in sessionStorage so a hard refresh on the
      // review page can still show the listing (photos will be empty in that
      // case; the page handles that gracefully).
      try {
        sessionStorage.setItem(
          'pending-lot',
          JSON.stringify({ listing, condition, quantity, notes, nextLotNumber })
        );
      } catch {
        // Silently ignore — in-memory store is the source of truth.
      }

      router.push(`/auctions/${id}/lots/new/review`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg pb-28">
      <Header title={`Lot #${nextLotNumber}`} backHref={`/auctions/${id}`} />

      <div className="p-4 space-y-6">
        {/* Lotter starting-number panel (multi-lotter coordination) */}
        <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 text-sm">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-gray-700">
                Next lot: <span className="font-black text-brand-navy">#{nextLotNumber}</span>
                {hasLotterOverride && (
                  <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-brand-blue bg-brand-blue/10 px-1.5 py-0.5 rounded">
                    Your range
                  </span>
                )}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Auction max so far: #{auctionMaxLot}
                {hasLotterOverride ? ' • You picked a custom start' : ''}
              </p>
            </div>
            {!editingStart ? (
              <button
                onClick={() => {
                  setStartInput(String(nextLotNumber));
                  setEditingStart(true);
                }}
                className="text-xs font-bold text-brand-blue uppercase tracking-wide px-2 py-1 rounded border border-brand-blue/30"
              >
                Change start
              </button>
            ) : null}
          </div>
          {editingStart && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500">
                Pick the lot number you want to start from. Two lotters should
                pick non-overlapping ranges (e.g. you start at #1, your partner
                starts at #500). Your choice is saved to this browser only.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  value={startInput}
                  onChange={(e) => setStartInput(e.target.value)}
                  className="w-28 px-3 py-2 rounded border border-gray-200 text-center font-bold focus:outline-none focus:border-brand-blue"
                />
                <button
                  onClick={applyStart}
                  className="px-3 py-2 rounded bg-brand-navy text-white text-xs font-black uppercase tracking-wide"
                >
                  Use as start
                </button>
                {hasLotterOverride && (
                  <button
                    onClick={resetStart}
                    className="px-3 py-2 rounded border border-gray-300 text-gray-500 text-xs font-bold uppercase tracking-wide"
                  >
                    Reset to auction max+1
                  </button>
                )}
                <button
                  onClick={() => {
                    setEditingStart(false);
                    setStartInput('');
                  }}
                  className="text-xs text-gray-400 px-2"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Photos */}
        <div>
          <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
            Photos
          </label>
          <PhotoGrid
            photos={photos}
            onPhotosChange={setPhotos}
            disabled={loading}
          />
        </div>

        {/* Condition */}
        <ConditionSlider value={condition} onChange={setCondition} />

        {/* Quantity */}
        <div>
          <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
            Quantity Per Lot
          </label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
            className="w-24 px-4 py-3 rounded-lg border border-gray-200 focus:outline-none focus:border-brand-blue text-center font-bold"
          />
          <p className="text-xs text-gray-400 mt-1">
            Units in this single lot (e.g. case of 6)
          </p>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-bold text-gray-700 uppercase tracking-wide mb-2">
            Notes
          </label>
          <SpeechInput
            value={notes}
            onChange={setNotes}
            placeholder="Tap the mic or type notes for the AI..."
            rows={3}
          />
        </div>

        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}
      </div>

      {/* Generate button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-brand-bg via-brand-bg to-transparent pt-8">
        {loading && (
          <div className="mb-3">
            <IndeterminateBar label="Analyzing photos, identifying item, fetching prices..." />
          </div>
        )}
        <GradientButton
          onClick={handleGenerate}
          loading={loading}
          disabled={photos.length === 0}
        >
          Generate Listing
        </GradientButton>
      </div>
    </div>
  );
}
