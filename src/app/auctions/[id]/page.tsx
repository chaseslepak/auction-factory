'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Auction, LotWithPhotos } from '@/lib/types';
import Header from '@/components/Header';
import GradientButton from '@/components/GradientButton';
import ConfidenceChip from '@/components/ConfidenceChip';

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [lots, setLots] = useState<LotWithPhotos[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchData = async () => {
    const [auctionRes, lotsRes] = await Promise.all([
      supabase.from('auctions').select('*').eq('id', id).single(),
      supabase
        .from('lots')
        .select('*, lot_photos(*)')
        .eq('auction_id', id)
        .order('lot_number', { ascending: true }),
    ]);

    if (auctionRes.data) setAuction(auctionRes.data);
    if (lotsRes.data) setLots(lotsRes.data as LotWithPhotos[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const deleteLot = async (lotId: string) => {
    if (!confirm('Delete this lot?')) return;

    // Delete photos from storage first
    const lot = lots.find((l) => l.id === lotId);
    if (lot?.lot_photos.length) {
      const paths = lot.lot_photos.map((p) => p.storage_path);
      await supabase.storage.from('lot-photos').remove(paths);
    }

    await supabase.from('lots').delete().eq('id', lotId);
    fetchData();
  };

  const getPhotoUrl = (path: string) => {
    const { data } = supabase.storage.from('lot-photos').getPublicUrl(path);
    return data.publicUrl;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-bg">
        <Header title="Loading..." backHref="/auctions" />
        <p className="text-center text-gray-400 py-12">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg pb-24">
      <Header
        title={auction?.name || 'Auction'}
        backHref="/auctions"
      />

      <div className="px-4 py-2">
        <p className="text-sm text-gray-400">
          {lots.length} lot{lots.length !== 1 ? 's' : ''}
        </p>
      </div>

      <div className="p-4 space-y-3">
        {lots.length === 0 ? (
          <p className="text-center text-gray-400 py-12">
            No lots yet. Add your first!
          </p>
        ) : (
          lots.map((lot) => (
            <div
              key={lot.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden"
            >
              <Link
                href={`/auctions/${id}/lots/${lot.id}/review`}
                className="flex items-center p-3 gap-3 active:bg-gray-50 transition-colors"
              >
                {/* Lot number badge */}
                <div className="w-12 h-12 bg-brand-navy rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-black text-sm">
                    #{lot.lot_number}
                  </span>
                </div>

                {/* Thumbnail */}
                {lot.lot_photos[0] && (
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                    <img
                      src={getPhotoUrl(lot.lot_photos[0].storage_path)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-brand-navy text-sm truncate">
                    {lot.item_name || 'Untitled'}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {lot.listed_price && (
                      <span className="text-brand-green font-bold text-sm">
                        ${Number(lot.listed_price).toLocaleString()}
                      </span>
                    )}
                    {lot.quantity > 1 && (
                      <span className="bg-brand-blue/10 text-brand-blue text-xs font-bold px-1.5 py-0.5 rounded">
                        Qty {lot.quantity}
                      </span>
                    )}
                    <ConfidenceChip confidence={lot.confidence} />
                  </div>
                </div>
              </Link>

              {/* Delete */}
              <div className="border-t border-gray-100 px-3 py-2 flex justify-end">
                <button
                  onClick={() => deleteLot(lot.id)}
                  className="text-red-400 text-xs font-medium hover:text-red-600"
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Sticky new lot button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-brand-bg via-brand-bg to-transparent pt-8">
        <Link href={`/auctions/${id}/new-lot`}>
          <GradientButton>New Lot</GradientButton>
        </Link>
      </div>
    </div>
  );
}
