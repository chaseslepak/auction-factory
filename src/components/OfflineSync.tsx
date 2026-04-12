'use client';

import { useEffect, useState } from 'react';
import { getPendingCount, getPendingLots, markLotSynced, clearSyncedLots, isOnline } from '@/lib/offline-queue';

export default function OfflineSync() {
  const [pendingCount, setPendingCount] = useState(0);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const updateOnlineStatus = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    setOnline(navigator.onLine);

    // Check for pending lots on mount
    const checkPending = async () => {
      try {
        const count = await getPendingCount();
        setPendingCount(count);
      } catch {}
    };
    checkPending();

    // When coming back online, try to sync
    const handleOnline = async () => {
      await syncPendingLots();
    };
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('online', updateOnlineStatus);
      window.removeEventListener('offline', updateOnlineStatus);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const syncPendingLots = async () => {
    if (syncing) return;
    setSyncing(true);
    try {
      const lots = await getPendingLots();
      for (const lot of lots) {
        try {
          const res = await fetch('/api/generate-listing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              images: lot.photos,
              condition: lot.condition,
              quantity: lot.quantity,
              notes: lot.notes,
              auction_name: lot.auctionName,
            }),
          });

          if (res.ok) {
            const listing = await res.json();
            // Store in sessionStorage for the review page to pick up
            sessionStorage.setItem(
              'offline-synced-lot',
              JSON.stringify({
                listing,
                auctionId: lot.auctionId,
                photos: lot.photos,
                condition: lot.condition,
                quantity: lot.quantity,
                notes: lot.notes,
              })
            );
            await markLotSynced(lot.id!);
          }
        } catch {
          // Will retry next time we're online
        }
      }
      await clearSyncedLots();
      const remaining = await getPendingCount();
      setPendingCount(remaining);
    } catch {}
    setSyncing(false);
  };

  if (!online) {
    return (
      <div className="fixed top-0 left-0 right-0 bg-orange-500 text-white text-center text-xs font-bold py-1 z-[200]">
        Offline — lots will be saved locally and synced when back online
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div className="fixed top-0 left-0 right-0 bg-brand-blue text-white text-center text-xs font-bold py-1 z-[200]">
        {syncing
          ? 'Syncing offline lots...'
          : `${pendingCount} offline lot(s) pending — `}
        {!syncing && (
          <button onClick={syncPendingLots} className="underline ml-1">
            Sync now
          </button>
        )}
      </div>
    );
  }

  return null;
}
