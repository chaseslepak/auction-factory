// IndexedDB-based offline queue for lot creation.
// When the user is offline or API calls fail, lot data is queued locally.
// When back online, the queue syncs automatically.

const DB_NAME = 'af-lotter-offline';
const DB_VERSION = 1;
const STORE_NAME = 'pending_lots';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export interface PendingLot {
  id?: number;
  auctionId: string;
  photos: string[]; // base64 data URIs
  condition: number;
  quantity: number;
  notes: string;
  auctionName: string;
  createdAt: string;
  synced: boolean;
}

export async function queueOfflineLot(lot: Omit<PendingLot, 'id' | 'synced' | 'createdAt'>): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  store.add({ ...lot, synced: false, createdAt: new Date().toISOString() });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingLots(): Promise<PendingLot[]> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readonly');
  const store = tx.objectStore(STORE_NAME);
  const request = store.getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result.filter((l: PendingLot) => !l.synced));
    request.onerror = () => reject(request.error);
  });
}

export async function markLotSynced(id: number): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const request = store.get(id);
  request.onsuccess = () => {
    const lot = request.result;
    if (lot) {
      lot.synced = true;
      store.put(lot);
    }
  };
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearSyncedLots(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, 'readwrite');
  const store = tx.objectStore(STORE_NAME);
  const request = store.getAll();
  request.onsuccess = () => {
    for (const lot of request.result) {
      if (lot.synced) {
        store.delete(lot.id);
      }
    }
  };
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getPendingCount(): Promise<number> {
  const lots = await getPendingLots();
  return lots.length;
}

// Check if we're online
export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}
