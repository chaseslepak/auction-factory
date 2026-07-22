'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import Header from '@/components/Header';

interface QueueRow {
  id: string;
  name: string;
  hq_upload_status: 'ready' | 'uploading' | 'done';
  hq_ready_at: string | null;
  total_lots: number;
  uploaded_lots: number;
}

export default function HqUploadQueuePage() {
  const [rows, setRows] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [flippingId, setFlippingId] = useState<string | null>(null);
  const supabase = createClient();

  const fetchQueue = async () => {
    // Pull every auction that's in the HQ workflow (ready / uploading / done)
    const { data: auctions } = await supabase
      .from('auctions')
      .select('id, name, hq_upload_status, hq_ready_at')
      .in('hq_upload_status', ['ready', 'uploading', 'done'])
      .order('hq_ready_at', { ascending: true, nullsFirst: true });

    if (!auctions) {
      setLoading(false);
      return;
    }

    // Grab lot counts + uploaded counts for each
    const auctionIds = auctions.map((a) => a.id);
    const { data: lots } = auctionIds.length
      ? await supabase
          .from('lots')
          .select('auction_id, af_upload_status')
          .in('auction_id', auctionIds)
          .is('deleted_at', null)
      : { data: [] as { auction_id: string; af_upload_status: string | null }[] };

    const totalByAuction = new Map<string, number>();
    const uploadedByAuction = new Map<string, number>();
    for (const lot of lots || []) {
      totalByAuction.set(lot.auction_id, (totalByAuction.get(lot.auction_id) || 0) + 1);
      if (lot.af_upload_status === 'uploaded') {
        uploadedByAuction.set(
          lot.auction_id,
          (uploadedByAuction.get(lot.auction_id) || 0) + 1
        );
      }
    }

    const built: QueueRow[] = auctions.map((a) => ({
      id: a.id,
      name: a.name,
      hq_upload_status: a.hq_upload_status,
      hq_ready_at: a.hq_ready_at,
      total_lots: totalByAuction.get(a.id) || 0,
      uploaded_lots: uploadedByAuction.get(a.id) || 0,
    }));

    // Auto-flip: any auction where every lot is uploaded → mark 'done' so it
    // moves out of the active queue on the next poll.
    for (const row of built) {
      if (
        row.hq_upload_status !== 'done' &&
        row.total_lots > 0 &&
        row.uploaded_lots === row.total_lots
      ) {
        await supabase
          .from('auctions')
          .update({ hq_upload_status: 'done' })
          .eq('id', row.id);
        row.hq_upload_status = 'done';
      }
    }

    setRows(built);
    setLoading(false);
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 15000);
    return () => clearInterval(interval);
  }, []);

  const markUploading = async (id: string) => {
    setFlippingId(id);
    await supabase
      .from('auctions')
      .update({ hq_upload_status: 'uploading' })
      .eq('id', id);
    await fetchQueue();
    setFlippingId(null);
  };

  const clearStatus = async (id: string) => {
    if (!confirm('Clear this auction from the HQ queue? It will drop back to the locations\' workflow.'))
      return;
    setFlippingId(id);
    await supabase
      .from('auctions')
      .update({ hq_upload_status: null, hq_ready_at: null })
      .eq('id', id);
    await fetchQueue();
    setFlippingId(null);
  };

  const ready = rows.filter((r) => r.hq_upload_status === 'ready');
  const uploading = rows.filter((r) => r.hq_upload_status === 'uploading');
  const done = rows.filter((r) => r.hq_upload_status === 'done');

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header title="HQ Upload Queue" backHref="/admin" />

      <div className="p-4 space-y-4">
        <p className="text-xs text-gray-500 leading-relaxed">
          Locations mark their auctions ready here. Log into the correct Auction
          Factory admin account in a browser tab, click <b>Open Browser Upload</b>{' '}
          on the auction, then run the bookmarklet from that AF tab. Auctions
          auto-move to &ldquo;Done&rdquo; once every lot shows <code>uploaded</code>.
        </p>

        {loading && (
          <p className="text-center text-gray-400 text-sm py-8">Loading…</p>
        )}

        {!loading && rows.length === 0 && (
          <div className="bg-white rounded-xl p-6 border border-gray-100 text-center">
            <p className="text-sm text-gray-500">
              Nothing in the queue. Waiting on locations to mark auctions ready.
            </p>
          </div>
        )}

        {ready.length > 0 && (
          <QueueSection title={`Ready (${ready.length})`} tone="green">
            {ready.map((r) => (
              <QueueCard
                key={r.id}
                row={r}
                onOpen={() => markUploading(r.id)}
                onClear={() => clearStatus(r.id)}
                flippingId={flippingId}
              />
            ))}
          </QueueSection>
        )}

        {uploading.length > 0 && (
          <QueueSection title={`Uploading (${uploading.length})`} tone="blue">
            {uploading.map((r) => (
              <QueueCard
                key={r.id}
                row={r}
                onOpen={() => markUploading(r.id)}
                onClear={() => clearStatus(r.id)}
                flippingId={flippingId}
              />
            ))}
          </QueueSection>
        )}

        {done.length > 0 && (
          <QueueSection title={`Done (${done.length})`} tone="gray">
            {done.map((r) => (
              <QueueCard
                key={r.id}
                row={r}
                onOpen={() => markUploading(r.id)}
                onClear={() => clearStatus(r.id)}
                flippingId={flippingId}
              />
            ))}
          </QueueSection>
        )}
      </div>
    </div>
  );
}

function QueueSection({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'green' | 'blue' | 'gray';
  children: React.ReactNode;
}) {
  const toneClass =
    tone === 'green'
      ? 'text-brand-green'
      : tone === 'blue'
      ? 'text-brand-blue'
      : 'text-gray-400';
  return (
    <div className="space-y-2">
      <h2 className={`text-xs font-black uppercase tracking-wide ${toneClass}`}>{title}</h2>
      {children}
    </div>
  );
}

function QueueCard({
  row,
  onOpen,
  onClear,
  flippingId,
}: {
  row: QueueRow;
  onOpen: () => void;
  onClear: () => void;
  flippingId: string | null;
}) {
  const remaining = row.total_lots - row.uploaded_lots;
  const busy = flippingId === row.id;
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-brand-navy truncate">{row.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {row.uploaded_lots}/{row.total_lots} on AF
            {row.hq_ready_at && ` • ready ${new Date(row.hq_ready_at).toLocaleString()}`}
          </p>
        </div>
        <button
          onClick={onClear}
          disabled={busy}
          className="text-[10px] font-bold text-gray-400 uppercase px-2 py-1 rounded border border-gray-200 disabled:opacity-50 flex-shrink-0"
          title="Clear from HQ queue"
        >
          Clear
        </button>
      </div>
      {row.hq_upload_status !== 'done' && remaining > 0 && (
        <div className="mt-3 flex gap-2">
          <Link
            href={`/auctions/${row.id}/browser-upload`}
            onClick={onOpen}
            className="flex-1 text-center py-2 rounded-lg bg-brand-green text-white text-xs font-black uppercase tracking-wide"
          >
            Open Browser Upload ({remaining} left)
          </Link>
          <Link
            href={`/auctions/${row.id}`}
            className="px-3 py-2 rounded-lg border border-gray-200 text-xs font-bold text-gray-500 uppercase"
          >
            View
          </Link>
        </div>
      )}
      {row.hq_upload_status === 'done' && (
        <p className="mt-2 text-xs text-brand-green font-bold">✓ All lots uploaded</p>
      )}
    </div>
  );
}
