'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Auction, LotWithPhotos } from '@/lib/types';
import Header from '@/components/Header';
import GradientButton from '@/components/GradientButton';
import ConfidenceChip from '@/components/ConfidenceChip';
import ProgressBar from '@/components/ProgressBar';

export default function AuctionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [auction, setAuction] = useState<Auction | null>(null);
  const [lots, setLots] = useState<LotWithPhotos[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [refreshProgress, setRefreshProgress] = useState({ current: 0, total: 0 });
  const [afLinked, setAfLinked] = useState(false);
  const [showAfLink, setShowAfLink] = useState(false);
  const [afAuctionId, setAfAuctionId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'uploaded' | 'not_uploaded' | 'failed'>('all');
  const [sortBy, setSortBy] = useState<'lot_number' | 'price_desc' | 'price_asc' | 'confidence'>('lot_number');
  const [selectedLots, setSelectedLots] = useState<Set<string>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [afAuctions, setAfAuctions] = useState<{ id: string; name: string }[]>([]);
  const supabase = createClient();

  const fetchData = async () => {
    const [auctionRes, lotsRes, afMapRes] = await Promise.all([
      supabase.from('auctions').select('*').eq('id', id).single(),
      supabase
        .from('lots')
        .select('*, lot_photos(*)')
        .eq('auction_id', id)
        .is('deleted_at', null)
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
    setAfAuctions([]);
    try {
      const res = await fetch('/api/af-auctions');
      const data = await res.json();
      if (data.auctions && data.auctions.length > 0) {
        setAfAuctions(data.auctions);
      } else if (data.error) {
        setUploadMsg({ type: 'error', text: `AF auctions: ${data.error}` });
      } else {
        setUploadMsg({ type: 'error', text: 'No AF auctions found. Check AF session in Settings.' });
      }
    } catch (err: any) {
      setUploadMsg({ type: 'error', text: `Failed to fetch AF auctions: ${err.message}` });
    }
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
    if (!confirm('Search for stock images and pricing for all lots with known brand+model?\n\nThis runs in the background — you can close this tab and come back later.')) return;
    setRefreshing(true);
    setUploadMsg(null);
    setRefreshProgress({ current: 0, total: 0 });

    try {
      // Enqueue all candidate lots as background jobs
      const enqueueRes = await fetch('/api/jobs/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auction_id: id }),
      });

      const enqueueText = await enqueueRes.text();
      let enqueueData: any;
      try {
        enqueueData = JSON.parse(enqueueText);
      } catch {
        throw new Error(`Server returned non-JSON: ${enqueueText.substring(0, 150)}`);
      }

      if (!enqueueRes.ok || enqueueData.error) {
        throw new Error(enqueueData.error || `Server error ${enqueueRes.status}`);
      }

      if (enqueueData.enqueued === 0) {
        setUploadMsg({ type: 'error', text: enqueueData.message });
        setRefreshing(false);
        return;
      }

      setUploadMsg({
        type: 'success',
        text: `Queued ${enqueueData.enqueued} lots — processing in background. Safe to close tab.`,
      });

      // Start polling for progress
      pollJobStatus();
    } catch (err: any) {
      setUploadMsg({ type: 'error', text: err.message });
      setRefreshing(false);
    }
  };

  const pollJobStatus = async (lastDone = -1, stallCount = 0) => {
    try {
      const res = await fetch(`/api/jobs/status?auction_id=${id}`);
      if (!res.ok) {
        setRefreshing(false);
        return;
      }
      const data = await res.json();

      const done = (data.completed || 0) + (data.failed || 0);
      const total = data.total || 0;

      setRefreshProgress({ current: done, total });

      if (data.active) {
        // Detect stall: if nothing changed since last poll, kick the processor
        const isStalled = done === lastDone;
        const newStallCount = isStalled ? stallCount + 1 : 0;

        // Kick every 2 stalls (6 seconds) if progress is stuck
        if (newStallCount >= 2) {
          fetch('/api/jobs/process', { method: 'POST' }).catch(() => {});
        }
        // Also always kick if there are pending jobs but nothing processing
        if ((data.pending || 0) > 0 && (data.processing || 0) === 0) {
          fetch('/api/jobs/process', { method: 'POST' }).catch(() => {});
        }

        // Still processing, poll again in 3 seconds
        setTimeout(() => pollJobStatus(done, newStallCount), 3000);
      } else {
        // All done
        setRefreshing(false);
        if (total > 0) {
          setUploadMsg({
            type: 'success',
            text: `Done! ${data.found || 0} stock images found, ${total} lots processed`,
          });
          fetchData();
          // Clean up completed jobs
          fetch(`/api/jobs/status?auction_id=${id}`, { method: 'DELETE' }).catch(() => {});
        }
      }
    } catch {
      setRefreshing(false);
    }
  };

  // On mount, check if there are active jobs and resume polling
  useEffect(() => {
    const checkActiveJobs = async () => {
      try {
        const res = await fetch(`/api/jobs/status?auction_id=${id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.active) {
          setRefreshing(true);
          pollJobStatus();
        }
      } catch {}
    };
    if (id) checkActiveJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
    setUploadProgress({ current: 0, total: unuploaded.length });

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

        setUploadProgress({ current: totalSucceeded + totalFailed, total: unuploaded.length });

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
    setUploadProgress({ current: 0, total: 0 });
  };

  const deleteLot = async (lotId: string) => {
    if (!confirm('Delete this lot? (Can be restored from trash)')) return;

    // Soft delete — keeps photos and data, just marks as deleted
    await supabase
      .from('lots')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', lotId);
    fetchData();
  };

  const getPhotoUrl = (path: string) => {
    const { data } = supabase.storage.from('lot-photos').getPublicUrl(path);
    return data.publicUrl;
  };

  // Compute filtered + sorted lots
  const filteredLots = (() => {
    let result = [...lots];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((lot) => {
        return (
          (lot.item_name || '').toLowerCase().includes(q) ||
          (lot.brand || '').toLowerCase().includes(q) ||
          (lot.model || '').toLowerCase().includes(q) ||
          String(lot.lot_number).includes(q)
        );
      });
    }

    // Filter by upload status
    if (filterStatus !== 'all') {
      result = result.filter((lot) => {
        const status = (lot as any).af_upload_status;
        if (filterStatus === 'uploaded') return status === 'uploaded';
        if (filterStatus === 'not_uploaded') return status !== 'uploaded' && status !== 'failed';
        if (filterStatus === 'failed') return status === 'failed';
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'lot_number') return a.lot_number - b.lot_number;
      if (sortBy === 'price_desc') return (Number(b.listed_price) || 0) - (Number(a.listed_price) || 0);
      if (sortBy === 'price_asc') return (Number(a.listed_price) || 0) - (Number(b.listed_price) || 0);
      if (sortBy === 'confidence') {
        const order: Record<string, number> = { high: 3, medium: 2, low: 1 };
        return (order[b.confidence || ''] || 0) - (order[a.confidence || ''] || 0);
      }
      return 0;
    });

    return result;
  })();

  const toggleLotSelection = (lotId: string) => {
    setSelectedLots((prev) => {
      const next = new Set(prev);
      if (next.has(lotId)) next.delete(lotId);
      else next.add(lotId);
      return next;
    });
  };

  const bulkDelete = async () => {
    if (selectedLots.size === 0) return;
    if (!confirm(`Delete ${selectedLots.size} selected lot(s)?`)) return;
    await supabase
      .from('lots')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', Array.from(selectedLots));
    setSelectedLots(new Set());
    setBulkMode(false);
    fetchData();
  };

  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkPriceMultiplier, setBulkPriceMultiplier] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkCondition, setBulkCondition] = useState('');

  const applyBulkEdit = async () => {
    if (selectedLots.size === 0) return;
    const updates: any = {};

    if (bulkCategory.trim()) updates.category = bulkCategory.trim();
    if (bulkCondition) updates.condition_rating = Number(bulkCondition);

    if (bulkPriceMultiplier) {
      const multi = Number(bulkPriceMultiplier);
      if (!isNaN(multi) && multi > 0) {
        // Apply multiplier per-lot (can't do in one query)
        const lotsToUpdate = lots.filter((l) => selectedLots.has(l.id));
        for (const lot of lotsToUpdate) {
          const currentRetail = Number(lot.estimated_retail_new) || 0;
          const newRetail = Math.round(currentRetail * multi);
          const newListed = Math.round(newRetail * 1.10);
          await supabase
            .from('lots')
            .update({
              estimated_retail_new: newRetail,
              listed_price: newListed,
              ...updates,
            })
            .eq('id', lot.id);
        }
        setBulkEditOpen(false);
        setSelectedLots(new Set());
        setBulkMode(false);
        setBulkPriceMultiplier('');
        setBulkCategory('');
        setBulkCondition('');
        fetchData();
        return;
      }
    }

    if (Object.keys(updates).length > 0) {
      await supabase.from('lots').update(updates).in('id', Array.from(selectedLots));
    }
    setBulkEditOpen(false);
    setSelectedLots(new Set());
    setBulkMode(false);
    setBulkCategory('');
    setBulkCondition('');
    fetchData();
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
                    Select the AF auction or enter the internal ID manually
                  </p>
                  {afAuctions.length > 0 && (
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
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={afAuctionId}
                      onChange={(e) => setAfAuctionId(e.target.value)}
                      placeholder="Or enter AF internal ID (e.g. 4805)"
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-blue"
                    />
                    <button
                      onClick={handleLinkAf}
                      disabled={!afAuctionId}
                      className="px-4 py-2 gradient-btn text-white text-xs font-bold rounded-lg disabled:opacity-50"
                    >
                      Link
                    </button>
                  </div>
                  {afAuctions.length === 0 && (
                    <p className="text-xs text-gray-400">
                      Tip: AF internal ID can be found by going to AF admin {'>'}  Add Item {'>'}  viewing the dropdown
                    </p>
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
              {uploading && uploadProgress.total > 0 && (
                <ProgressBar
                  current={uploadProgress.current}
                  total={uploadProgress.total}
                  label="Uploading to AF"
                />
              )}
              {refreshing && (
                <ProgressBar
                  current={refreshProgress.current}
                  total={refreshProgress.total || 1}
                  label={refreshProgress.total > 0 ? 'Finding stock images & pricing' : 'Starting scan...'}
                />
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

      {/* Search + Filter + Sort bar */}
      {lots.length > 0 && (
        <div className="px-4 mb-2 space-y-2">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by item name, brand, model, lot #"
            className="w-full px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-blue"
          />
          <div className="flex gap-2">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium focus:outline-none focus:border-brand-blue"
            >
              <option value="all">All lots</option>
              <option value="not_uploaded">Not uploaded</option>
              <option value="uploaded">Uploaded to AF</option>
              <option value="failed">Failed</option>
            </select>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs font-medium focus:outline-none focus:border-brand-blue"
            >
              <option value="lot_number">Lot # (asc)</option>
              <option value="price_desc">Price (high-low)</option>
              <option value="price_asc">Price (low-high)</option>
              <option value="confidence">Confidence</option>
            </select>
            <button
              onClick={() => {
                setBulkMode(!bulkMode);
                setSelectedLots(new Set());
              }}
              className={`px-3 py-2 rounded-lg border text-xs font-bold uppercase tracking-wide ${
                bulkMode
                  ? 'bg-brand-blue text-white border-brand-blue'
                  : 'border-gray-200 text-gray-600'
              }`}
            >
              Select
            </button>
          </div>
          {bulkMode && selectedLots.size > 0 && (
            <div className="flex gap-2 items-center bg-brand-blue/5 rounded-lg p-2">
              <span className="text-xs font-bold text-brand-blue">{selectedLots.size} selected</span>
              <button
                onClick={() => setBulkEditOpen(true)}
                className="ml-auto px-3 py-1 rounded text-xs font-bold text-brand-blue border border-brand-blue/30"
              >
                Edit
              </button>
              <button
                onClick={bulkDelete}
                className="px-3 py-1 rounded text-xs font-bold text-red-500 border border-red-300"
              >
                Delete
              </button>
            </div>
          )}
          <p className="text-xs text-gray-400">
            Showing {filteredLots.length} of {lots.length}
          </p>
        </div>
      )}

      {/* Auction Stats Summary */}
      {lots.length > 0 && (
        <div className="px-4 mb-3">
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Total Value</p>
              <p className="text-sm font-black text-brand-green">
                ${lots.reduce((sum, l) => sum + (Number(l.listed_price) || 0) * (l.quantity || 1), 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Uploaded</p>
              <p className="text-sm font-black text-brand-blue">
                {lots.filter((l: any) => l.af_upload_status === 'uploaded').length}/{lots.length}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide">Avg Price</p>
              <p className="text-sm font-black text-brand-navy">
                ${Math.round(
                  lots.reduce((sum, l) => sum + (Number(l.listed_price) || 0), 0) / lots.length
                ).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="p-4 space-y-3">
        {filteredLots.length === 0 ? (
          <p className="text-center text-gray-400 py-12">
            {lots.length === 0 ? 'No lots yet. Add your first!' : 'No lots match your filters'}
          </p>
        ) : (
          filteredLots.map((lot) => (
            <div
              key={lot.id}
              className={`bg-white rounded-xl shadow-sm border overflow-hidden ${
                selectedLots.has(lot.id) ? 'border-brand-blue' : 'border-gray-100'
              }`}
            >
              {bulkMode ? (
                <div
                  onClick={() => toggleLotSelection(lot.id)}
                  className="flex items-center p-3 gap-3 cursor-pointer active:bg-gray-50"
                >
                  <div
                    className={`w-6 h-6 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedLots.has(lot.id)
                        ? 'bg-brand-blue border-brand-blue'
                        : 'border-gray-300'
                    }`}
                  >
                    {selectedLots.has(lot.id) && (
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </div>
                  <div className="w-12 h-12 bg-brand-navy rounded-lg flex items-center justify-center flex-shrink-0">
                    <span className="text-white font-black text-sm">#{lot.lot_number}</span>
                  </div>
                  {lot.lot_photos[0] && (
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                      <img
                        src={getPhotoUrl(lot.lot_photos[0].storage_path)}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-brand-navy text-sm truncate">{lot.item_name || 'Untitled'}</p>
                  </div>
                </div>
              ) : (
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
                      <span
                        className="bg-red-100 text-red-700 text-xs font-bold px-1.5 py-0.5 rounded"
                        title={(lot as any).af_upload_error || 'Upload failed'}
                      >
                        Failed
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              )}

              {/* Delete (only show when not in bulk mode) */}
              {!bulkMode && (
              <div className="border-t border-gray-100 px-3 py-2 flex justify-end">
                <button
                  onClick={() => deleteLot(lot.id)}
                  className="text-red-400 text-xs font-medium hover:text-red-600"
                >
                  Delete
                </button>
              </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Bulk edit modal */}
      {bulkEditOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end">
          <div className="bg-white w-full rounded-t-2xl p-6 space-y-4">
            <h2 className="font-black text-brand-navy text-sm tracking-[0.1em] uppercase">
              Bulk Edit ({selectedLots.size} lots)
            </h2>

            <div>
              <label className="text-xs font-medium text-gray-400 uppercase">
                Price Multiplier (leave blank to skip)
              </label>
              <input
                type="text"
                value={bulkPriceMultiplier}
                onChange={(e) => setBulkPriceMultiplier(e.target.value)}
                placeholder="e.g. 1.1 for +10%, 0.9 for -10%"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-400 uppercase">
                Category (leave blank to skip)
              </label>
              <input
                type="text"
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                placeholder="e.g. Refrigeration"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-blue"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-400 uppercase">
                Condition (leave blank to skip)
              </label>
              <select
                value={bulkCondition}
                onChange={(e) => setBulkCondition(e.target.value)}
                className="w-full mt-1 px-3 py-2 rounded-lg border border-gray-200 text-sm"
              >
                <option value="">Don&apos;t change</option>
                <option value="10">10 - New in box</option>
                <option value="9">9 - Like New</option>
                <option value="8">8 - Excellent</option>
                <option value="7">7 - Good</option>
                <option value="6">6 - Average</option>
                <option value="5">5 - Well used</option>
                <option value="4">4 - Functions</option>
                <option value="3">3 - Needs parts</option>
                <option value="2">2 - Repairable</option>
                <option value="1">1 - Broken</option>
              </select>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setBulkEditOpen(false)}
                className="flex-1 py-3 rounded-full border border-gray-200 font-bold text-gray-500 text-sm uppercase"
              >
                Cancel
              </button>
              <div className="flex-1">
                <GradientButton onClick={applyBulkEdit}>Apply</GradientButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sticky new lot button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-brand-bg via-brand-bg to-transparent pt-8">
        <Link href={`/auctions/${id}/new-lot`}>
          <GradientButton>New Lot</GradientButton>
        </Link>
      </div>
    </div>
  );
}
