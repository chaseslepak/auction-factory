'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { LotWithPhotos, GenerateListingResponse } from '@/lib/types';
import Header from '@/components/Header';
import GradientButton from '@/components/GradientButton';
import ConfidenceChip from '@/components/ConfidenceChip';
import ProgressBar from '@/components/ProgressBar';
import IndeterminateBar from '@/components/IndeterminateBar';

export default function LotReviewPage() {
  const { id: auctionId, lotId } = useParams<{ id: string; lotId: string }>();
  const router = useRouter();
  const supabase = createClient();
  const isNew = lotId === 'new';

  // New lot state
  const [listing, setListing] = useState<GenerateListingResponse | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [condition, setCondition] = useState(5);
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');
  const [nextLotNumber, setNextLotNumber] = useState(1);
  const [editMode, setEditMode] = useState(false);

  // Helper to update listing fields
  const updateListingField = (field: keyof GenerateListingResponse, value: any) => {
    if (!listing) return;
    const updated = { ...listing, [field]: value };
    // If retail price changed, recalculate listed price
    if (field === 'estimated_retail_new') {
      const retail = Number(value) || 0;
      updated.listed_price = Math.round(retail * 1.10);
    }
    setListing(updated);
  };

  // Existing lot state
  const [existingLot, setExistingLot] = useState<LotWithPhotos | null>(null);

  // Shared state
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [rangeCount, setRangeCount] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ current: 0, total: 0 });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isNew) {
      const pending = sessionStorage.getItem('pending-lot');
      if (!pending) {
        router.push(`/auctions/${auctionId}/new-lot`);
        return;
      }
      const data = JSON.parse(pending);
      setListing(data.listing);
      setPhotos(data.photos);
      setCondition(data.condition);
      setQuantity(data.quantity);
      setNotes(data.notes);
      setNextLotNumber(data.nextLotNumber);
    } else {
      const fetchLot = async () => {
        const { data } = await supabase
          .from('lots')
          .select('*, lot_photos(*)')
          .eq('id', lotId)
          .single();
        if (data) {
          setExistingLot(data as LotWithPhotos);
          // Also populate the listing state for edit mode
          setListing({
            item_name: data.item_name || '',
            brand: data.brand || '',
            model: data.model || '',
            category: data.category || '',
            confidence: (data.confidence || 'medium') as 'high' | 'medium' | 'low',
            estimated_retail_new: Number(data.estimated_retail_new) || 0,
            listed_price: Number(data.listed_price) || 0,
            width: data.width || '',
            depth: data.depth || '',
            height: data.height || '',
            key_features: data.key_features || [],
            stock_image_url: '',
            auction_description: data.auction_description || '',
          });
          setCondition(data.condition_rating || 5);
          setQuantity(data.quantity || 1);
          setNotes(data.notes || '');
        }
      };
      fetchLot();
    }
  }, [isNew, lotId, auctionId]);

  const getPhotoUrl = (path: string) => {
    const { data } = supabase.storage.from('lot-photos').getPublicUrl(path);
    return data.publicUrl;
  };

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const [reuploading, setReuploading] = useState(false);

  const handleUpdateExisting = async () => {
    if (!listing || !existingLot) return;
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('lots')
        .update({
          item_name: listing.item_name,
          brand: listing.brand,
          model: listing.model,
          category: listing.category,
          confidence: listing.confidence,
          condition_rating: condition,
          quantity,
          estimated_retail_new: listing.estimated_retail_new,
          listed_price: listing.listed_price,
          width: listing.width || null,
          depth: listing.depth || null,
          height: listing.height || null,
          key_features: listing.key_features,
          auction_description: listing.auction_description,
          notes,
        })
        .eq('id', existingLot.id);

      if (updateError) throw updateError;

      setEditMode(false);
      // Refresh the lot
      const { data } = await supabase
        .from('lots')
        .select('*, lot_photos(*)')
        .eq('id', lotId)
        .single();
      if (data) setExistingLot(data as LotWithPhotos);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleReuploadLot = async () => {
    if (!existingLot) return;
    if (!confirm('Re-upload this lot to AF? This creates a NEW lot on AF — delete the old one manually from AF admin.')) return;
    setReuploading(true);
    setError(null);
    try {
      // Reset upload status
      await supabase
        .from('lots')
        .update({ af_upload_status: null, af_upload_error: null })
        .eq('id', existingLot.id);

      // Upload
      const res = await fetch('/api/af-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auction_id: auctionId,
          lot_ids: [existingLot.id],
        }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        const result = data.results?.[0];
        if (result?.success) {
          alert('Re-uploaded! Remember to delete the old lot from AF admin.');
          router.push(`/auctions/${auctionId}`);
        } else {
          setError(result?.error || 'Upload failed');
        }
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReuploading(false);
    }
  };

  const handleSave = async () => {
    if (!listing) return;
    setSaving(true);
    setError(null);

    try {
      const lotsToCreate = mode === 'single' ? 1 : Number(rangeCount) || 0;
      if (mode === 'range' && lotsToCreate < 2) {
        setError('Please enter how many lots to create (minimum 2)');
        setSaving(false);
        return;
      }

      setSaveProgress({ current: 0, total: lotsToCreate });

      for (let i = 0; i < lotsToCreate; i++) {
        const lotNumber = nextLotNumber + i;

        // Insert lot row
        const { data: lotData, error: lotError } = await supabase
          .from('lots')
          .insert({
            auction_id: auctionId,
            lot_number: lotNumber,
            item_name: listing.item_name,
            brand: listing.brand,
            model: listing.model,
            category: listing.category,
            confidence: listing.confidence,
            condition_rating: condition,
            quantity,
            estimated_retail_new: listing.estimated_retail_new,
            listed_price: listing.listed_price,
            width: listing.width || null,
            depth: listing.depth || null,
            height: listing.height || null,
            key_features: listing.key_features,
            auction_description: listing.auction_description,
            notes,
          })
          .select()
          .single();

        if (lotError) throw lotError;

        // Upload photos to storage and create lot_photos records
        let photoIndex = 0;

        // If stock image URL is available, download and make it the first photo
        if (listing.stock_image_url) {
          try {
            const stockRes = await fetch(listing.stock_image_url);
            if (stockRes.ok) {
              const stockBlob = await stockRes.blob();
              const storagePath = `${auctionId}/${lotData.id}/stock_0.jpg`;
              const { error: stockUploadError } = await supabase.storage
                .from('lot-photos')
                .upload(storagePath, stockBlob, { contentType: 'image/jpeg' });
              if (!stockUploadError) {
                await supabase.from('lot_photos').insert({
                  lot_id: lotData.id,
                  storage_path: storagePath,
                  display_order: 0,
                });
                photoIndex = 1;
              }
            }
          } catch {
            // Stock image download failed, continue with user photos
          }
        }

        // Upload user photos
        for (let j = 0; j < photos.length; j++) {
          const base64 = photos[j].replace(/^data:image\/\w+;base64,/, '');
          const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const blob = new Blob([buffer], { type: 'image/jpeg' });

          const storagePath = `${auctionId}/${lotData.id}/${photoIndex + j}.jpg`;

          const { error: uploadError } = await supabase.storage
            .from('lot-photos')
            .upload(storagePath, blob, { contentType: 'image/jpeg' });

          if (uploadError) throw uploadError;

          await supabase.from('lot_photos').insert({
            lot_id: lotData.id,
            storage_path: storagePath,
            display_order: photoIndex + j,
          });
        }

        setSaveProgress({ current: i + 1, total: lotsToCreate });
      }

      // Clear pending data
      sessionStorage.removeItem('pending-lot');
      router.push(`/auctions/${auctionId}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  // Determine what to display
  const displayListing = isNew
    ? listing
    : existingLot
      ? {
          item_name: existingLot.item_name || '',
          brand: existingLot.brand || '',
          model: existingLot.model || '',
          category: existingLot.category || '',
          confidence: existingLot.confidence || 'medium',
          estimated_retail_new: existingLot.estimated_retail_new || 0,
          listed_price: existingLot.listed_price || 0,
          key_features: existingLot.key_features || [],
          auction_description: existingLot.auction_description || '',
        }
      : null;

  const displayPhotos = isNew
    ? photos
    : existingLot?.lot_photos.map((p) => getPhotoUrl(p.storage_path)) || [];

  if (!displayListing) {
    return (
      <div className="min-h-screen bg-brand-bg">
        <Header title="Loading..." backHref={`/auctions/${auctionId}`} />
        <p className="text-center text-gray-400 py-12">Loading...</p>
      </div>
    );
  }

  const displayQuantity = isNew ? quantity : existingLot?.quantity || 1;
  const displayConfidence = (displayListing.confidence || 'medium') as 'high' | 'medium' | 'low';

  return (
    <div className="min-h-screen bg-brand-bg pb-28">
      <Header
        title={isNew ? `Lot #${nextLotNumber} Review` : `Lot #${existingLot?.lot_number}`}
        backHref={isNew ? `/auctions/${auctionId}/new-lot` : `/auctions/${auctionId}`}
      />

      <div className="p-4 space-y-4">
        {/* Photos */}
        {displayPhotos.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {displayPhotos.map((photo, i) => (
              <div
                key={i}
                className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200"
              >
                <img
                  src={photo}
                  alt={`Photo ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        )}

        {/* Edit toggle */}
        {listing && (
          <button
            onClick={() => setEditMode(!editMode)}
            className={`w-full py-2 rounded-lg border-2 font-bold text-sm uppercase tracking-wide transition-colors ${
              editMode
                ? 'border-brand-green text-brand-green bg-brand-green/5'
                : 'border-gray-200 text-gray-500'
            }`}
          >
            {editMode ? 'Done Editing' : 'Edit Listing'}
          </button>
        )}

        {/* Item summary card */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-start justify-between mb-2 gap-2">
            {editMode && listing ? (
              <input
                type="text"
                value={listing.item_name}
                onChange={(e) => updateListingField('item_name', e.target.value)}
                className="flex-1 font-black text-brand-navy text-lg px-2 py-1 rounded border border-gray-200 focus:outline-none focus:border-brand-blue"
              />
            ) : (
              <h2 className="font-black text-brand-navy text-lg">
                {displayListing.item_name}
              </h2>
            )}
            <ConfidenceChip confidence={displayConfidence} />
          </div>

          <div className="space-y-2 text-sm text-gray-600">
            {editMode && listing ? (
              <>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase">Brand</label>
                  <input
                    type="text"
                    value={listing.brand}
                    onChange={(e) => updateListingField('brand', e.target.value)}
                    className="w-full mt-0.5 px-2 py-1 rounded border border-gray-200 focus:outline-none focus:border-brand-blue"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase">Model</label>
                  <input
                    type="text"
                    value={listing.model}
                    onChange={(e) => updateListingField('model', e.target.value)}
                    className="w-full mt-0.5 px-2 py-1 rounded border border-gray-200 focus:outline-none focus:border-brand-blue"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-400 uppercase">Category</label>
                  <input
                    type="text"
                    value={listing.category}
                    onChange={(e) => updateListingField('category', e.target.value)}
                    className="w-full mt-0.5 px-2 py-1 rounded border border-gray-200 focus:outline-none focus:border-brand-blue"
                  />
                </div>
              </>
            ) : (
              <>
                {displayListing.brand && displayListing.brand !== 'Unknown' && (
                  <p>
                    <span className="font-medium text-gray-400">Brand:</span>{' '}
                    {displayListing.brand}
                  </p>
                )}
                {displayListing.model && displayListing.model !== 'Unknown' && (
                  <p>
                    <span className="font-medium text-gray-400">Model:</span>{' '}
                    {displayListing.model}
                  </p>
                )}
                {displayListing.category && (
                  <p>
                    <span className="font-medium text-gray-400">Category:</span>{' '}
                    {displayListing.category}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="mt-3 flex items-center gap-4">
            <div>
              <p className="text-xs text-gray-400">Est. Retail</p>
              {editMode && listing ? (
                <div className="flex items-center">
                  <span className="font-bold text-brand-green mr-1">$</span>
                  <input
                    type="number"
                    value={listing.estimated_retail_new}
                    onChange={(e) => updateListingField('estimated_retail_new', Number(e.target.value))}
                    className="w-24 font-bold text-brand-green px-2 py-1 rounded border border-gray-200 focus:outline-none focus:border-brand-blue"
                  />
                </div>
              ) : (
                <p className="font-bold text-brand-green">
                  ${Number(displayListing.estimated_retail_new).toLocaleString()}
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400">Listed Price</p>
              <p className="font-bold text-brand-green">
                ${Number(displayListing.listed_price).toLocaleString()}
              </p>
            </div>
            {displayQuantity > 1 && (
              <div>
                <p className="text-xs text-gray-400">Quantity</p>
                <p className="font-bold text-brand-blue">{displayQuantity}</p>
              </div>
            )}
          </div>
        </div>

        {/* Auction description card */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide">
              Auction Listing
            </h3>
            <button
              onClick={() => handleCopy(displayListing.auction_description)}
              className="text-xs font-bold text-brand-blue px-3 py-1 rounded-full border border-brand-blue/20 hover:bg-brand-blue/5"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          {editMode && listing ? (
            <textarea
              value={listing.auction_description}
              onChange={(e) => updateListingField('auction_description', e.target.value)}
              rows={14}
              className="w-full text-sm text-gray-700 font-sans leading-relaxed px-3 py-2 rounded border border-gray-200 focus:outline-none focus:border-brand-blue resize-y"
            />
          ) : (
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
              {displayListing.auction_description}
            </pre>
          )}
        </div>

        {/* Key features */}
        {displayListing.key_features && displayListing.key_features.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-2">
              Key Features
            </h3>
            <ul className="space-y-1">
              {displayListing.key_features.map((f: string, i: number) => (
                <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                  <span className="text-brand-green mt-0.5">&#8226;</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Lot assignment toggle (new lots only) */}
        {isNew && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-3">
              Lot Assignment
            </h3>
            <div className="flex rounded-lg overflow-hidden border border-gray-200">
              <button
                onClick={() => setMode('single')}
                className={`flex-1 py-2 text-sm font-bold uppercase tracking-wide transition-colors ${
                  mode === 'single'
                    ? 'gradient-btn text-white'
                    : 'bg-white text-gray-400'
                }`}
              >
                Single Lot
              </button>
              <button
                onClick={() => setMode('range')}
                className={`flex-1 py-2 text-sm font-bold uppercase tracking-wide transition-colors ${
                  mode === 'range'
                    ? 'gradient-btn text-white'
                    : 'bg-white text-gray-400'
                }`}
              >
                Range / Dupes
              </button>
            </div>
            {mode === 'range' && (
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <label className="text-sm text-gray-600">
                  Create
                </label>
                <input
                  type="number"
                  min={2}
                  max={50}
                  value={rangeCount}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') {
                      setRangeCount('');
                    } else {
                      setRangeCount(Math.max(0, Math.min(50, Number(v))));
                    }
                  }}
                  placeholder="#"
                  className="w-20 px-3 py-2 rounded-lg border border-gray-200 text-center font-bold focus:outline-none focus:border-brand-blue"
                />
                <label className="text-sm text-gray-600">
                  identical lots
                  {rangeCount && Number(rangeCount) >= 2 && (
                    <> (#{nextLotNumber}&ndash;#{nextLotNumber + Number(rangeCount) - 1})</>
                  )}
                </label>
              </div>
            )}
          </div>
        )}

        {error && (
          <p className="text-red-500 text-sm text-center">{error}</p>
        )}
      </div>

      {/* Bottom actions */}
      {isNew ? (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-brand-bg via-brand-bg to-transparent pt-8">
          {saving && saveProgress.total > 1 && (
            <div className="mb-3">
              <ProgressBar
                current={saveProgress.current}
                total={saveProgress.total}
                label="Saving lots"
              />
            </div>
          )}
          {saving && saveProgress.total <= 1 && (
            <div className="mb-3">
              <IndeterminateBar label="Saving lot..." />
            </div>
          )}
          <div className="flex gap-3">
            <button
              onClick={() => router.push(`/auctions/${auctionId}/new-lot`)}
              className="flex-1 py-4 rounded-full border-2 border-gray-300 font-black text-sm text-gray-500 uppercase tracking-wide"
            >
              Redo
            </button>
            <div className="flex-1">
              <GradientButton onClick={handleSave} loading={saving}>
                Save Lot{mode === 'range' ? 's' : ''}
              </GradientButton>
            </div>
          </div>
        </div>
      ) : (
        <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-brand-bg via-brand-bg to-transparent pt-8">
          {editMode ? (
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setEditMode(false);
                  // Reset listing to original lot data
                  if (existingLot) {
                    setListing({
                      item_name: existingLot.item_name || '',
                      brand: existingLot.brand || '',
                      model: existingLot.model || '',
                      category: existingLot.category || '',
                      confidence: (existingLot.confidence || 'medium') as 'high' | 'medium' | 'low',
                      estimated_retail_new: Number(existingLot.estimated_retail_new) || 0,
                      listed_price: Number(existingLot.listed_price) || 0,
                      width: (existingLot as any).width || '',
                      depth: (existingLot as any).depth || '',
                      height: (existingLot as any).height || '',
                      key_features: existingLot.key_features || [],
                      stock_image_url: '',
                      auction_description: existingLot.auction_description || '',
                    });
                  }
                }}
                className="flex-1 py-4 rounded-full border-2 border-gray-300 font-black text-sm text-gray-500 uppercase tracking-wide"
              >
                Cancel
              </button>
              <div className="flex-1">
                <GradientButton onClick={handleUpdateExisting} loading={saving}>
                  Save Changes
                </GradientButton>
              </div>
            </div>
          ) : (
            <>
              {reuploading && (
                <div className="mb-3">
                  <IndeterminateBar label="Re-uploading to Auction Factory..." />
                </div>
              )}
              <button
                onClick={handleReuploadLot}
                disabled={reuploading}
                className="w-full py-4 rounded-full border-2 border-orange-400 text-orange-500 font-black text-sm uppercase tracking-wide disabled:opacity-50"
              >
                {reuploading ? 'Re-uploading...' : 'Re-upload to AF'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
