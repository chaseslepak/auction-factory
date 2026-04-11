'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { LotWithPhotos } from '@/lib/types';
import Header from '@/components/Header';

export default function TrashPage() {
  const [deletedLots, setDeletedLots] = useState<(LotWithPhotos & { auctions?: { name: string } })[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetchDeleted = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('lots')
      .select('*, lot_photos(*), auctions(name)')
      .not('deleted_at', 'is', null)
      .order('deleted_at', { ascending: false });

    if (data) setDeletedLots(data as any);
    setLoading(false);
  };

  useEffect(() => {
    fetchDeleted();
  }, []);

  const restore = async (lotId: string) => {
    await supabase.from('lots').update({ deleted_at: null }).eq('id', lotId);
    fetchDeleted();
  };

  const purge = async (lotId: string) => {
    if (!confirm('Permanently delete this lot? This cannot be undone.')) return;
    const lot = deletedLots.find((l) => l.id === lotId);
    if (lot?.lot_photos?.length) {
      const paths = lot.lot_photos.map((p) => p.storage_path);
      await supabase.storage.from('lot-photos').remove(paths);
    }
    await supabase.from('lots').delete().eq('id', lotId);
    fetchDeleted();
  };

  const purgeAll = async () => {
    if (!confirm(`Permanently delete all ${deletedLots.length} trashed lots? This cannot be undone.`)) return;
    for (const lot of deletedLots) {
      if (lot.lot_photos?.length) {
        const paths = lot.lot_photos.map((p) => p.storage_path);
        await supabase.storage.from('lot-photos').remove(paths);
      }
      await supabase.from('lots').delete().eq('id', lot.id);
    }
    fetchDeleted();
  };

  const getPhotoUrl = (path: string) => {
    const { data } = supabase.storage.from('lot-photos').getPublicUrl(path);
    return data.publicUrl;
  };

  return (
    <div className="min-h-screen bg-brand-bg pb-24">
      <Header title="Trash" backHref="/admin" />

      <div className="p-4 space-y-3">
        {loading ? (
          <p className="text-center text-gray-400 py-12">Loading...</p>
        ) : deletedLots.length === 0 ? (
          <p className="text-center text-gray-400 py-12">Trash is empty</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-400">{deletedLots.length} deleted lots</p>
              <button
                onClick={purgeAll}
                className="text-xs font-bold text-red-500"
              >
                Empty Trash
              </button>
            </div>
            {deletedLots.map((lot) => (
              <div
                key={lot.id}
                className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-3"
              >
                <div className="w-12 h-12 bg-gray-400 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-black text-sm">#{lot.lot_number}</span>
                </div>
                {lot.lot_photos?.[0] && (
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100 opacity-60">
                    <img
                      src={getPhotoUrl(lot.lot_photos[0].storage_path)}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-600 text-sm truncate">{lot.item_name || 'Untitled'}</p>
                  <p className="text-xs text-gray-400">{lot.auctions?.name}</p>
                </div>
                <button
                  onClick={() => restore(lot.id)}
                  className="px-3 py-1 rounded text-xs font-bold text-brand-blue border border-brand-blue/30"
                >
                  Restore
                </button>
                <button
                  onClick={() => purge(lot.id)}
                  className="px-2 py-1 text-xs font-bold text-red-500"
                >
                  Delete
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
