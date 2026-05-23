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
      if (lotsRes.data && lotsRes.data.length > 0) {
        setNextLotNumber(lotsRes.data[0].lot_number + 1);
      }
    };
    fetchData();
  }, [id]);

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
