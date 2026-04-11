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
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [afLinked, setAfLinked] = useState(false);
  const [showAfLink, setShowAfLink] = useState(false);
  const [afAuctionId, setAfAuctionId] = useState('');
  const [afAuctions, setAfAuctions] = useState<{ id: string; name: string }[]>([]);
  const supabase = createClient();

  const fetchData = async () => {
    const [auctionRes, lotsRes, afMapRes] = await Promise.all([
      supabase.from('auctions').select('*').eq('id', id).single(),
      supabase
        .from('lots')
        .select('*, lot_photos(*)')
        .eq('auction_id', id)
        .order('lot_number', { ascending: true }),
      supabase
        .from('af_auction_map')
        .select('af_auction_id')
        .eq('auction_id', id)
        .single(),
    ]);

    if (auctionRes.data) setAuction(auctionRes.data);
    if (lotsRes.data) setLots(lotsRes.data as LotWithPhotos[]);
    if (afMapRes.data) {
      setAfLinked(true);
      setAfAuctionId(afMapRes.data.af_auction_id);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleShowAfLink = async () => {
    setShowAfLink(true);
    try {
      const res = await fetch('/api/af-auctions');
      const data = await res.json();
      if (data.auctions) setAfAuctions(data.auctions);
    } catch {}
  };

  const handleLinkAf = async () => {
    if (!afAuctionId.trim()) return;
    await supabase.from('af_auction_map').upsert({
      auction_id: id,
      af_auction_id: afAuctionId.trim(),
    });
    setAfLinked(true);
    setShowAfLink(false);
  };

  const handleReuploadToAf = async () => {
    const uploaded = lots.filter((l) => l.af_upload_status === 'uploaded');
    if (uploaded.length === 0) {
      setUploadMsg({ type: 'error', text: 'No uploaded lots to re-upload.' });
      return;
    }
    if (!confirm(`Re-upload ${uploaded.length} lot(s) to Auction Factory? This creates NEW lots on AF — you must manually delete the old ones in the AF admin.`)) return;

    setUploading(true);
    setUploadMsg(null);

    // Reset their upload status so the upload route will process them
    await supabase
      .from('lots')
      .update({ af_upload_status: null, af_upload_error: null })
      .in('id', uploaded.map((l) => l.id));

    // Refresh lots state
    await fetchData();

    const BATCH_SIZE = 5;
    const batches: string[][] = [];
    for (let i = 0; i < uploaded.length; i += BATCH_SIZE) {
      batches.push(uploaded.slice(i, i + BATCH_SIZE).map((l) => l.id));
    }

    let totalSucceeded = 0;
    let totalFailed = 0;
    let lastError: string | null = null;

    try {
      for (let i = 0; i < batches.length; i++) {
        setUploadMsg({
          type: 'success',
          text: `Re-uploading batch ${i + 1}/${batches.length} (${totalSucceeded}/${uploaded.length} done)...`,
        });

        const res = await fetch('/api/af-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auction_id: id,
            lot_ids: batches[i],
          }),
        });

        const data = await res.json();
        if (data.error) {
          lastError = data.error;
          totalFailed += batches[i].length;
          if (data.error.includes('session expired') || data.error.includes('Please re-login')) {
            break;
          }
          continue;
        }

        const succeeded = data.results.filter((r: any) => r.success).length;
        const failed = data.results.filter((r: any) => !r.success).length;
        totalSucceeded += succeeded;
        totalFailed += failed;
        fetchData();
      }

      setUploadMsg({
        type: totalFailed === 0 ? 'success' : 'error',
        text: totalFailed === 0
          ? `${totalSucceeded} lot(s) re-uploaded! Delete old ones in AF admin.`
          : `${totalSucceeded} re-uploaded, ${totalFailed} failed${lastError ? `: ${lastError}` : ''}`,
      });
      fetchData();
    } catch (err: any) {
      setUploadMsg({ type: 'error', text: err.message });
    }

    setUploading(false);
  };

  const handleRefreshStockImages = async () => {
    if (!confirm('Search for stock images for all lots with known brand+model that dont have one yet? (Skips already-uploaded lots)')) return;
    setRefreshing(true);
    setUploadMsg(null);
    try {
      const res = await fetch('/api/refresh-stock-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auction_id: id }),
      });
      const data = await res.json();
      if (data.error) {
        setUploadMsg({ type: 'error', text: data.error });
      } else {
        setUploadMsg({
          type: data.updated > 0 ? 'success' : 'error',
          text: data.updated > 0
            ? `Added stock images to ${data.updated} lot(s)`
            : data.message || `Scanned ${data.candidates}, none found`,
        });
        fetchData();
      }
    } catch (err: any) {
      setUploadMsg({ type: 'error', text: err.message });
    }
    setRefreshing(false);
  };

  const handleUploadToAf = async () => {
    const unuploaded = lots.filter(
      (l) => l.af_upload_status !== 'uploaded'
    );
    if (unuploaded.length === 0) {
      setUploadMsg({ type: 'error', text: 'All lots already uploaded.' });
      return;
    }
    if (!confirm(`Upload ${unuploaded.length} lot(s) to Auction Factory?`)) return;

    setUploading(true);
    setUploadMsg(null);

    const BATCH_SIZE = 5;
    const batches: string[][] = [];
    for (let i = 0; i < unuploaded.length; i += BATCH_SIZE) {
      batches.push(unuploaded.slice(i, i + BATCH_SIZE).map((l) => l.id));
    }

    let totalSucceeded = 0;
    let totalFailed = 0;
    let lastError: string | null = null;

    try {
      for (let i = 0; i < batches.length; i++) {
        setUploadMsg({
          type: 'success',
          text: `Uploading batch ${i + 1}/${batches.length} (${totalSucceeded}/${unuploaded.length} done)...`,
        });

        const res = await fetch('/api/af-upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auction_id: id,
            lot_ids: batches[i],
          }),
        });

        const data = await res.json();
        if (data.error) {
          lastError = data.error;
          totalFailed += batches[i].length;
          // If it's a session expired error, stop — no point continuing
          if (data.error.includes('session expired') || data.error.includes('Please re-login')) {
            break;
          }
          continue;
        }

        const succeeded = data.results.filter((r: any) => r.success).length;
        const failed = data.results.filter((r: any) => !r.success).length;
        totalSucceeded += succeeded;
        totalFailed += failed;

        // Refresh lots after each batch to show progress
        fetchData();
      }

      if (lastError && totalSucceeded === 0) {
        setUploadMsg({ type: 'error', text: lastError });
      } else {
        setUploadMsg({
          type: totalFailed === 0 ? 'success' : 'error',
          text: totalFailed === 0
            ? `${totalSucceeded} lot${totalSucceeded !== 1 ? 's' : ''} uploaded to AF!`
            : `${totalSucceeded} uploaded, ${totalFailed} failed${lastError ? `: ${lastError}` : ''}`,
        });
      }
      fetchData();
    } catch (err: any) {
      setUploadMsg({ type: 'error', text: err.message });
    }

    setUploading(false);
  };

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

      <div className="px-4 py-2 flex items-center justify-between">
        <p className="text-sm text-gray-400">
          {lots.length} lot{lots.length !== 1 ? 's' : ''}
        </p>
        <Link href="/settings" className="text-xs text-brand-blue font-medium">
          Settings
        </Link>
      </div>

      {/* AF Upload Section */}
      {lots.length > 0 && (
        <div className="px-4 mb-2">
          {!afLinked ? (
            <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
              {showAfLink ? (
                <div className="space-y-2">
                  <p className="text-xs text-gray-500">
                    Select the AF auction to upload lots to
                  </p>
                  {afAuctions.length === 0 ? (
                    <p className="text-xs text-gray-400">Loading AF auctions...</p>
                  ) : (
                    <div className="flex gap-2">
                      <select
                        value={afAuctionId}
                        onChange={(e) => setAfAuctionId(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-blue"
                      >
                        <option value="">Choose an auction...</option>
                        {afAuctions.map((a) => (
                          <option key={a.id} value={a.id}>{a.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={handleLinkAf}
                        disabled={!afAuctionId}
                        className="px-4 py-2 gradient-btn text-white text-xs font-bold rounded-lg disabled:opacity-50"
                      >
                        Link
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={handleShowAfLink}
                  className="w-full text-sm text-brand-blue font-bold"
                >
                  Link AF Auction for Upload
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <button
                onClick={handleRefreshStockImages}
                disabled={refreshing || uploading}
                className="w-full py-2 rounded-xl border-2 border-brand-blue text-brand-blue font-bold text-xs uppercase tracking-wide disabled:opacity-50"
              >
                {refreshing ? 'Searching for stock images...' : 'Find Stock Images'}
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleUploadToAf}
                  disabled={uploading}
                  className="flex-1 py-3 rounded-xl bg-brand-navy text-white font-black text-sm uppercase tracking-wide disabled:opacity-50"
                >
                  {uploading ? 'Uploading...' : 'Upload to AF'}
                </button>
                <button
                  onClick={async () => {
                    if (!confirm('Unlink AF auction? All lots will be reset to not-uploaded status and can be uploaded again.')) return;
                    await supabase.from('af_auction_map').delete().eq('auction_id', id);
                    // Reset upload status for all lots in this auction
                    await supabase
                      .from('lots')
                      .update({ af_upload_status: null, af_upload_error: null })
                      .eq('auction_id', id);
                    setAfLinked(false);
                    setAfAuctionId('');
                    fetchData();
                  }}
                  className="px-3 py-3 rounded-xl border border-gray-300 text-gray-400 text-xs"
                >
                  Unlink
                </button>
              </div>
              {lots.some((l) => (l as any).af_upload_status === 'uploaded') && (
                <button
                  onClick={handleReuploadToAf}
                  disabled={uploading}
                  className="w-full py-2 rounded-xl border-2 border-orange-400 text-orange-500 font-bold text-xs uppercase tracking-wide disabled:opacity-50"
                >
                  Re-upload Existing to AF (creates duplicates)
                </button>
              )}
              {uploadMsg && (
                <p className={`text-xs text-center ${uploadMsg.type === 'success' ? 'text-brand-green' : 'text-red-500'}`}>
                  {uploadMsg.text}
                </p>
              )}
            </div>
          )}
        </div>
      )}

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
                    {(lot as any).af_upload_status === 'uploaded' && (
                      <span className="bg-green-100 text-green-700 text-xs font-bold px-1.5 py-0.5 rounded">
                        AF
                      </span>
                    )}
                    {(lot as any).af_upload_status === 'failed' && (
                      <span className="bg-red-100 text-red-700 text-xs font-bold px-1.5 py-0.5 rounded">
                        Failed
                      </span>
                    )}
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
