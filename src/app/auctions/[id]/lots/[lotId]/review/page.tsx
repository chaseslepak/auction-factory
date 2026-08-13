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
import ReorderablePhotos from '@/components/ReorderablePhotos';
import ImageZoom from '@/components/ImageZoom';
import ConditionSlider from '@/components/ConditionSlider';
import { getPendingLot, clearPendingLot } from '@/lib/pending-lot-store';

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
  const [editHistory, setEditHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [zoomImage, setZoomImage] = useState<string | null>(null);

  // Shared state
  const [mode, setMode] = useState<'single' | 'range'>('single');
  const [rangeCount, setRangeCount] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);
  const [saveProgress, setSaveProgress] = useState({ current: 0, total: 0 });
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [duplicates, setDuplicates] = useState<any[]>([]);

  useEffect(() => {
    if (isNew) {
      // Prefer the in-memory store (has photos); fall back to sessionStorage
      // for the small fields on a hard refresh.
      const mem = getPendingLot();
      const sessionRaw = sessionStorage.getItem('pending-lot');
      if (!mem && !sessionRaw) {
        router.push(`/auctions/${auctionId}/new-lot`);
        return;
      }
      if (mem) {
        setListing(mem.listing);
        setPhotos(mem.photos);
        setCondition(mem.condition);
        setQuantity(mem.quantity);
        setNotes(mem.notes);
        setNextLotNumber(mem.nextLotNumber);
      } else if (sessionRaw) {
        // Photos were lost on refresh — kick the user back to upload again.
        router.push(`/auctions/${auctionId}/new-lot`);
        return;
      }
      // Surface a reference to data for the duplicate check below.
      const data = mem!;

      // Check for duplicates in this auction by brand+model
      const checkDuplicates = async () => {
        const brand = data.listing?.brand;
        const model = data.listing?.model;
        if (brand && brand !== 'Unknown' && model && model !== 'Unknown') {
          const { data: similar } = await supabase
            .from('lots')
            .select('id, lot_number, item_name, brand, model')
            .eq('auction_id', auctionId)
            .is('deleted_at', null)
            .eq('brand', brand)
            .eq('model', model);
          if (similar && similar.length > 0) {
            setDuplicates(similar);
          }
        }
      };
      checkDuplicates();
    } else {
      const fetchLot = async () => {
        // Skip soft-deleted rows so a bookmark to a trashed lot can't
        // be used to hit "Re-upload" and push it back to AF.
        const { data } = await supabase
          .from('lots')
          .select('*, lot_photos(*)')
          .eq('id', lotId)
          .is('deleted_at', null)
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
            key_features: Array.isArray(data.key_features) ? data.key_features : [],
            stock_image_url: '',
            auction_description: data.auction_description || '',
          });
          setCondition(data.condition_rating || 5);
          setQuantity(data.quantity || 1);
          setNotes(data.notes || '');

          // Load edit history
          const { data: edits } = await supabase
            .from('lot_edits')
            .select('*')
            .eq('lot_id', lotId)
            .order('created_at', { ascending: false })
            .limit(50);
          if (edits) setEditHistory(edits);
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
  const [findingStockImage, setFindingStockImage] = useState(false);
  const [stockImageMsg, setStockImageMsg] = useState<string | null>(null);

  const handleUpdateExisting = async () => {
    if (!listing || !existingLot) return;
    setSaving(true);
    setError(null);
    try {
      // Track changed fields for edit history
      const { data: { user } } = await supabase.auth.getUser();
      const userEmail = user?.email || 'unknown';
      const changes: { field: string; oldV: string; newV: string }[] = [];

      const fieldsToCompare = [
        ['item_name', existingLot.item_name, listing.item_name],
        ['brand', existingLot.brand, listing.brand],
        ['model', existingLot.model, listing.model],
        ['category', existingLot.category, listing.category],
        ['condition_rating', String(existingLot.condition_rating || ''), String(condition)],
        ['estimated_retail_new', String(existingLot.estimated_retail_new || ''), String(listing.estimated_retail_new)],
        ['auction_description', existingLot.auction_description, listing.auction_description],
      ];

      for (const [field, oldV, newV] of fieldsToCompare) {
        if ((oldV || '') !== (newV || '')) {
          changes.push({ field: field!, oldV: oldV || '', newV: newV || '' });
        }
      }

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

      // Log edit history
      if (changes.length > 0) {
        const editRows = changes.map((c) => ({
          lot_id: existingLot.id,
          user_email: userEmail,
          field: c.field,
          old_value: c.oldV.substring(0, 500),
          new_value: c.newV.substring(0, 500),
        }));
        await supabase.from('lot_edits').insert(editRows);

        // Log activity
        await supabase.from('activity_log').insert({
          user_email: userEmail,
          action: 'edited',
          entity_type: 'lot',
          entity_id: existingLot.id,
          auction_id: existingLot.auction_id,
          details: { fields: changes.map((c) => c.field) },
        });
      }

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

  const handleFindStockImage = async () => {
    if (!existingLot) return;
    setFindingStockImage(true);
    setStockImageMsg(null);
    try {
      const enqueueRes = await fetch('/api/jobs/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auction_id: auctionId,
          lot_ids: [existingLot.id],
        }),
      });
      const enqueueData = await enqueueRes.json();
      if (!enqueueRes.ok || enqueueData.error) {
        throw new Error(enqueueData.error || enqueueData.message || 'Enqueue failed');
      }
      if (enqueueData.enqueued === 0) {
        setStockImageMsg(enqueueData.message || 'Nothing to enqueue.');
        setFindingStockImage(false);
        return;
      }

      // Poll until this lot's job is no longer pending/processing. Cap
      // at 60 polls (~3 min) so a stuck job (Anthropic outage, orphaned
      // pending row) can't spin the poller forever.
      const MAX_JOB_POLLS = 60;
      const pollJob = async (attempts = 0): Promise<void> => {
        if (attempts >= MAX_JOB_POLLS) {
          setStockImageMsg('Still running after 3 min — closed the poll. Check Admin → Jobs and reopen this lot.');
          setFindingStockImage(false);
          return;
        }
        try {
          const { data: jobs } = await supabase
            .from('jobs')
            .select('status, error')
            .eq('type', 'refresh_stock_images')
            .eq('lot_id', existingLot.id)
            .order('created_at', { ascending: false })
            .limit(1);
          const job = jobs?.[0];

          // Kick the processor if the job is still pending and nothing's picked it up
          if (job?.status === 'pending' || job?.status === 'processing') {
            fetch('/api/jobs/process', { method: 'POST' }).catch(() => {});
            setTimeout(() => pollJob(attempts + 1), 3000);
            return;
          }

          // Done — refetch the lot to pick up any new stock image/pricing
          const { data: fresh } = await supabase
            .from('lots')
            .select('*, lot_photos(*)')
            .eq('id', existingLot.id)
            .single();
          if (fresh) setExistingLot(fresh as LotWithPhotos);

          if (job?.status === 'failed') {
            setStockImageMsg(`Search failed: ${job.error || 'unknown error'}`);
          } else {
            setStockImageMsg('Stock image search complete.');
          }
        } catch {
          setStockImageMsg('Search finished (status unknown).');
        } finally {
          setFindingStockImage(false);
        }
      };
      setTimeout(pollJob, 2000);
    } catch (err: any) {
      setStockImageMsg(err.message);
      setFindingStockImage(false);
    }
  };

  const handleReuploadLot = async () => {
    if (!existingLot) return;
    if (!confirm('Re-upload this lot to AF? This creates a NEW lot on AF — delete the old one manually from AF admin.')) return;
    setReuploading(true);
    setError(null);
    try {
      // Reset upload status. If this silently fails (RLS / network), the
      // subsequent /api/af-upload hits the SAFETY GUARD and returns
      // "Already uploaded to AF — refusing to re-send", which is
      // confusing. Abort here with a clearer message instead.
      const { error: resetErr } = await supabase
        .from('lots')
        .update({ af_upload_status: null, af_upload_error: null })
        .eq('id', existingLot.id);
      if (resetErr) {
        setError(`Couldn't clear the upload status before re-uploading: ${resetErr.message}`);
        setReuploading(false);
        return;
      }

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

        // Hard-delete any soft-deleted lot with this auction_id + lot_number
        // to free up the unique constraint slot
        await supabase
          .from('lots')
          .delete()
          .eq('auction_id', auctionId)
          .eq('lot_number', lotNumber)
          .not('deleted_at', 'is', null);

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

        if (lotError) {
          // Surface a friendly message when two lotters collide on the same
          // lot number — the DB's unique(auction_id, lot_number) constraint
          // catches this. Tell the user to bump their starting number.
          const msg = String(lotError.message || '');
          if (
            msg.toLowerCase().includes('duplicate') ||
            msg.toLowerCase().includes('unique')
          ) {
            throw new Error(
              `Lot #${lotNumber} already exists in this auction — your partner likely just created it. Go back, open "Change start", and pick a higher starting number.`
            );
          }
          throw lotError;
        }

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

        // Upload user photos. A single failed photo upload should NOT
        // abort the whole range — the lot row is already saved, so
        // aborting here would leave partial state without advancing the
        // localStorage counter, forcing the user into a duplicate-lot-#
        // error on their next attempt. Log and continue instead.
        for (let j = 0; j < photos.length; j++) {
          try {
            const base64 = photos[j].replace(/^data:image\/\w+;base64,/, '');
            const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
            const blob = new Blob([buffer], { type: 'image/jpeg' });

            const storagePath = `${auctionId}/${lotData.id}/${photoIndex + j}.jpg`;

            const { error: uploadError } = await supabase.storage
              .from('lot-photos')
              .upload(storagePath, blob, { contentType: 'image/jpeg' });

            if (uploadError) {
              console.warn(`Photo ${j} upload failed for lot #${lotNumber}:`, uploadError);
              continue;
            }

            await supabase.from('lot_photos').insert({
              lot_id: lotData.id,
              storage_path: storagePath,
              display_order: photoIndex + j,
            });
          } catch (photoErr) {
            console.warn(`Photo ${j} exception for lot #${lotNumber}:`, photoErr);
          }
        }

        // Persist "next lot" pointer INSIDE the loop after every successful
        // insert, not just after the whole range completes. If a later
        // iteration throws (duplicate-key collision, network blip, etc.)
        // the user's next visit still defaults past what's already saved
        // instead of colliding with it.
        try {
          localStorage.setItem(`lotter-next-${auctionId}`, String(lotNumber + 1));
        } catch {}

        setSaveProgress({ current: i + 1, total: lotsToCreate });
      }

      // Clear pending data
      sessionStorage.removeItem('pending-lot');
      clearPendingLot();
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
          key_features: Array.isArray(existingLot.key_features) ? existingLot.key_features : [],
          auction_description: existingLot.auction_description || '',
        }
      : null;

  const displayPhotos = isNew
    ? photos
    : (existingLot?.lot_photos || [])
        .slice()
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
        .map((p) => getPhotoUrl(p.storage_path));

  const existingPhotoData = !isNew
    ? (existingLot?.lot_photos || [])
        .slice()
        .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    : [];

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm('Delete this photo?')) return;
    await fetch('/api/lot-photos', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photo_id: photoId }),
    });
    // Refresh
    const { data } = await supabase
      .from('lots')
      .select('*, lot_photos(*)')
      .eq('id', lotId)
      .single();
    if (data) setExistingLot(data as LotWithPhotos);
  };

  const handleReorderPhotos = async (photoIds: string[]) => {
    if (!existingLot) return;
    // Update display_order locally first for instant feedback
    const updated = photoIds.map((id, i) => {
      const photo = existingLot.lot_photos?.find((p) => p.id === id);
      return { ...photo!, display_order: i };
    });
    setExistingLot({ ...existingLot, lot_photos: updated } as LotWithPhotos);
    // Persist to database
    await fetch('/api/lot-photos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lot_id: existingLot.id, photo_ids: photoIds }),
    });
    // Always re-fetch from DB — on success this confirms the order stuck,
    // on failure the UI snaps back to DB truth.
    const { data } = await supabase
      .from('lots')
      .select('*, lot_photos(*)')
      .eq('id', lotId)
      .single();
    if (data) setExistingLot(data as LotWithPhotos);
  };

  const handleAddPhotos = async (files: FileList | null) => {
    if (!files || !existingLot) return;
    const { processImage } = await import('@/lib/image-utils');
    const maxOrder = Math.max(0, ...(existingLot.lot_photos || []).map((p) => p.display_order));
    for (let i = 0; i < files.length; i++) {
      try {
        const dataUrl = await processImage(files[i]);
        const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
        const blob = new Blob([buffer], { type: 'image/jpeg' });
        const storagePath = `${auctionId}/${existingLot.id}/extra_${Date.now()}_${i}.jpg`;
        await supabase.storage.from('lot-photos').upload(storagePath, blob, {
          contentType: 'image/jpeg',
          upsert: true,
        });
        await supabase.from('lot_photos').insert({
          lot_id: existingLot.id,
          storage_path: storagePath,
          display_order: maxOrder + 1 + i,
        });
      } catch (err) {
        console.error('Failed to add photo:', err);
      }
    }
    // Refresh
    const { data } = await supabase
      .from('lots')
      .select('*, lot_photos(*)')
      .eq('id', lotId)
      .single();
    if (data) setExistingLot(data as LotWithPhotos);
  };

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
        {!isNew ? (
          // Existing lot — use reorderable component
          (existingPhotoData.length > 0 || editMode) && (
            <ReorderablePhotos
              photos={existingPhotoData.map((p) => ({
                id: p.id,
                url: getPhotoUrl(p.storage_path),
                storage_path: p.storage_path,
              }))}
              onReorder={handleReorderPhotos}
              onDelete={handleDeletePhoto}
              onAdd={handleAddPhotos}
              onZoom={setZoomImage}
              canEdit={editMode}
            />
          )
        ) : (
          // New lot — simple display (no reorder since they're just base64 strings)
          displayPhotos.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2">
              {displayPhotos.map((photo, i) => (
                <div
                  key={i}
                  className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-200 relative"
                >
                  <img src={photo} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          )
        )}

        {/* Duplicate warning */}
        {isNew && duplicates.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-400 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-bold text-yellow-900">
                  Possible duplicate{duplicates.length > 1 ? 's' : ''} in this auction
                </p>
                <p className="text-xs text-yellow-800 mt-1">
                  Same brand + model found in:
                </p>
                <ul className="text-xs text-yellow-800 mt-1 space-y-0.5">
                  {duplicates.slice(0, 5).map((dup: any) => (
                    <li key={dup.id}>
                      • Lot #{dup.lot_number}: {dup.item_name}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Edit toggle + history */}
        {listing && (
          <div className="flex gap-2">
            <button
              onClick={() => setEditMode(!editMode)}
              className={`flex-1 py-2 rounded-lg border-2 font-bold text-sm uppercase tracking-wide transition-colors ${
                editMode
                  ? 'border-brand-green text-brand-green bg-brand-green/5'
                  : 'border-gray-200 text-gray-500'
              }`}
            >
              {editMode ? 'Done Editing' : 'Edit Listing'}
            </button>
            {!isNew && editHistory.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className="px-4 py-2 rounded-lg border-2 border-gray-200 text-gray-500 font-bold text-xs uppercase"
              >
                History ({editHistory.length})
              </button>
            )}
          </div>
        )}

        {/* Edit history drawer */}
        {showHistory && editHistory.length > 0 && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-3">
              Edit History
            </h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {editHistory.map((edit) => (
                <div key={edit.id} className="text-xs border-b border-gray-100 pb-2 last:border-b-0">
                  <div className="flex justify-between text-gray-400">
                    <span>{edit.user_email}</span>
                    <span>{new Date(edit.created_at).toLocaleString()}</span>
                  </div>
                  <div className="mt-0.5">
                    <span className="font-bold text-brand-navy">{edit.field}:</span>
                    <span className="text-red-500 line-through ml-1">
                      {edit.old_value?.substring(0, 50) || '(empty)'}
                    </span>
                    <span className="text-brand-green ml-1">
                      → {edit.new_value?.substring(0, 50) || '(empty)'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
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
                <ConditionSlider value={condition} onChange={setCondition} />
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
                <p>
                  <span className="font-medium text-gray-400">Condition:</span>{' '}
                  {condition}/10
                </p>
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
        {Array.isArray(displayListing.key_features) && displayListing.key_features.length > 0 && (
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

        {/* Per-lot stock image search (existing lots only) */}
        {!isNew && existingLot && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h3 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-2">
              Stock Image
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Search WebstaurantStore + the web for a stock image and current retail price for this lot.
            </p>
            <button
              onClick={handleFindStockImage}
              disabled={findingStockImage}
              className="w-full py-2 rounded-lg border-2 border-brand-blue text-brand-blue font-bold text-sm uppercase tracking-wide disabled:opacity-50"
            >
              {findingStockImage ? 'Searching…' : 'Find Stock Image'}
            </button>
            {findingStockImage && (
              <div className="mt-3">
                <IndeterminateBar label="Searching..." />
              </div>
            )}
            {stockImageMsg && !findingStockImage && (
              <p className="mt-3 text-xs text-gray-600">{stockImageMsg}</p>
            )}
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
                      key_features: Array.isArray(existingLot.key_features) ? existingLot.key_features : [],
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
          ) : null}
        </div>
      )}

      <ImageZoom src={zoomImage} onClose={() => setZoomImage(null)} />
    </div>
  );
}
