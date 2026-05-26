'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  type StorefrontProduct,
  type MarketplaceListing,
  selectByValueAndVariety,
  normalizeKey,
  FB_CONDITIONS,
  DEFAULT_BATCH_SIZE,
  MAX_PHOTOS,
} from '@/lib/marketplace';

const BUCKET = 'marketplace-photos';

function CgbButton({
  children, onClick, disabled, loading, className = '',
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`cgb-gradient-btn text-white font-black text-sm tracking-[0.08em] uppercase py-3 px-6 rounded-full transition-opacity disabled:opacity-40 ${className}`}
    >
      {loading ? 'Working…' : children}
    </button>
  );
}

export default function MarketplacePage() {
  const supabase = useMemo(() => createClient(), []);
  const [catalog, setCatalog] = useState<StorefrontProduct[]>([]);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const photoUrl = (path: string) =>
    supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;

  const listingByHandle = useMemo(() => {
    const m = new Map<string, MarketplaceListing>();
    for (const l of listings) m.set(l.handle, l);
    return m;
  }, [listings]);

  const loadListings = async () => {
    const res = await fetch('/api/marketplace/listings');
    const data = await res.json();
    if (res.ok) setListings(data.listings || []);
  };

  const loadCatalog = async () => {
    setLoadingCatalog(true);
    setError(null);
    try {
      const res = await fetch('/api/marketplace/catalog');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load catalog');
      setCatalog(data.products || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingCatalog(false);
    }
  };

  useEffect(() => {
    loadCatalog();
    loadListings();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Products that have at least one uploaded real photo and aren't posted yet.
  const readyProducts = useMemo(() => {
    return catalog.filter((p) => {
      const l = listingByHandle.get(p.handle);
      return l && (l.photo_paths?.length || 0) > 0 && l.status !== 'posted';
    });
  }, [catalog, listingByHandle]);

  // Auto-select a value+variety batch whenever ready products / batch size change.
  useEffect(() => {
    const picks = selectByValueAndVariety(readyProducts, batchSize);
    setSelected(new Set(picks.map((p) => p.handle)));
  }, [readyProducts, batchSize]);

  const toggleSelect = (handle: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(handle) ? next.delete(handle) : next.add(handle);
      return next;
    });
  };

  // Drag-a-folder upload: subfolder name (webkitRelativePath part) = product handle.
  const handleFolder = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      const { processImage } = await import('@/lib/image-utils');

      // Group files by their immediate subfolder.
      const groups = new Map<string, File[]>();
      for (const file of Array.from(fileList)) {
        const rel = (file as any).webkitRelativePath as string;
        const parts = rel.split('/');
        if (parts.length < 2) continue; // need root/subfolder/file
        const sub = parts[parts.length - 2];
        if (!/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) continue;
        if (!groups.has(sub)) groups.set(sub, []);
        groups.get(sub)!.push(file);
      }

      // Match each subfolder to a product by handle (then SKU).
      const byHandle = new Map(catalog.map((p) => [normalizeKey(p.handle), p]));
      const bySku = new Map(catalog.filter((p) => p.sku).map((p) => [normalizeKey(p.sku), p]));

      let matched = 0;
      const unmatched: string[] = [];

      for (const [sub, files] of Array.from(groups.entries())) {
        const product = byHandle.get(normalizeKey(sub)) || bySku.get(normalizeKey(sub));
        if (!product) {
          unmatched.push(sub);
          continue;
        }
        const paths: string[] = [];
        const ordered = files.slice(0, MAX_PHOTOS);
        for (let i = 0; i < ordered.length; i++) {
          const dataUrl = await processImage(ordered[i]);
          const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
          const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
          const blob = new Blob([bytes], { type: 'image/jpeg' });
          const path = `${product.handle}/${i}_${Date.now()}.jpg`;
          const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, blob, { contentType: 'image/jpeg', upsert: true });
          if (!upErr) paths.push(path);
        }
        if (paths.length === 0) continue;

        await fetch('/api/marketplace/listings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            handle: product.handle,
            product_id: product.id,
            product_type: product.productType,
            price: product.price,
            photo_paths: paths,
            status: 'draft',
          }),
        });
        matched++;
      }

      await loadListings();
      setUploadMsg(
        `Matched ${matched} product${matched !== 1 ? 's' : ''} to photos.` +
          (unmatched.length ? ` No product found for: ${unmatched.join(', ')}.` : '')
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const generateSelected = async () => {
    setGenerating(true);
    setError(null);
    try {
      for (const handle of Array.from(selected)) {
        const product = catalog.find((p) => p.handle === handle);
        const listing = listingByHandle.get(handle);
        if (!product || !listing) continue;
        const imageUrls = (listing.photo_paths || []).map(photoUrl);

        const res = await fetch('/api/marketplace/generate-listing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: product.title,
            descriptionText: product.descriptionText,
            productType: product.productType,
            price: product.price,
            imageUrls,
          }),
        });
        const draft = await res.json();
        if (!res.ok) {
          setError(`${product.title}: ${draft.error}`);
          continue;
        }

        await fetch('/api/marketplace/listings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            handle,
            title: draft.title,
            description: draft.description,
            condition: draft.condition,
            category: draft.category,
            keywords: draft.keywords,
            price: draft.price,
            match_warning: draft.match_warning,
            status: 'draft',
          }),
        });
      }
      await loadListings();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const patchListing = async (id: string, updates: Partial<MarketplaceListing>) => {
    setListings((prev) => prev.map((l) => (l.id === id ? { ...l, ...updates } : l)));
    await fetch('/api/marketplace/listings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    });
  };

  const mintToken = async () => {
    const res = await fetch('/api/marketplace/token', { method: 'POST' });
    const data = await res.json();
    if (res.ok) setToken(data.token);
    else setError(data.error);
  };

  const drafts = listings.filter((l) => l.status === 'draft' && (l.photo_paths?.length || 0) > 0);
  const approved = listings.filter((l) => l.status === 'approved');
  const generatedDrafts = drafts.filter((l) => l.title);

  return (
    <div>
      {/* Branded header */}
      <header className="sticky top-0 z-50 bg-cgb-ink px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="https://www.crazygoodbuy.com/cdn/shop/files/PNG_f0369a03-aca6-4c71-8cb4-dd63ea2b2d8b.png"
            alt="Crazy Good Buy"
            className="h-7 w-auto"
          />
          <span className="text-white font-black text-xs tracking-[0.15em] uppercase">
            Marketplace Poster
          </span>
        </div>
        <Link href="/auctions" className="text-cgb-amber text-xs font-semibold">
          Lotter →
        </Link>
      </header>

      <div className="max-w-3xl mx-auto p-4 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {/* Step 1: Catalog */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-cgb-ink text-sm tracking-wide uppercase">
              1 · Catalog
            </h2>
            <button onClick={loadCatalog} className="text-xs font-semibold text-cgb-orange">
              {loadingCatalog ? 'Loading…' : 'Refresh'}
            </button>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {loadingCatalog
              ? 'Pulling products from crazygoodbuy.com…'
              : `${catalog.length} products loaded from crazygoodbuy.com`}
          </p>
        </section>

        {/* Step 2: Photos */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-black text-cgb-ink text-sm tracking-wide uppercase">
            2 · Add Real Photos
          </h2>
          <p className="text-sm text-gray-500 mt-2 mb-3">
            Drag in a folder of subfolders named by product handle (or SKU). Each subfolder&apos;s
            photos get matched to that product. HEIC is converted automatically.
          </p>
          <label className="inline-flex items-center gap-2 cursor-pointer cgb-gradient-btn text-white font-black text-sm tracking-[0.08em] uppercase py-3 px-6 rounded-full disabled:opacity-40">
            {uploading ? 'Uploading…' : 'Choose Folder'}
            <input
              type="file"
              multiple
              className="hidden"
              disabled={uploading}
              ref={(el) => {
                if (el) {
                  el.setAttribute('webkitdirectory', '');
                  el.setAttribute('directory', '');
                }
              }}
              onChange={(e) => handleFolder(e.target.files)}
            />
          </label>
          {uploadMsg && <p className="text-sm text-gray-600 mt-3">{uploadMsg}</p>}
        </section>

        {/* Step 3: Select batch */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-black text-cgb-ink text-sm tracking-wide uppercase">
              3 · Select Batch
            </h2>
            <label className="text-xs text-gray-500 flex items-center gap-2">
              Batch size
              <input
                type="number"
                min={1}
                max={20}
                value={batchSize}
                onChange={(e) => setBatchSize(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 border border-gray-200 rounded px-2 py-1 text-sm"
              />
            </label>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Auto-picked by value + category variety. Adjust as you like.
          </p>
          <div className="mt-3 space-y-2">
            {readyProducts.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">
                No products with photos yet. Add photos above.
              </p>
            ) : (
              readyProducts.map((p) => (
                <label
                  key={p.handle}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(p.handle)}
                    onChange={() => toggleSelect(p.handle)}
                    className="accent-cgb-orange w-4 h-4"
                  />
                  <span className="flex-1 text-sm text-cgb-ink">{p.title}</span>
                  <span className="text-xs text-gray-400">{p.productType}</span>
                  <span className="text-sm font-semibold text-cgb-ink">
                    ${p.price.toLocaleString()}
                  </span>
                </label>
              ))
            )}
          </div>
          {readyProducts.length > 0 && (
            <div className="mt-4">
              <CgbButton onClick={generateSelected} loading={generating} disabled={selected.size === 0}>
                Generate {selected.size} Draft{selected.size !== 1 ? 's' : ''}
              </CgbButton>
            </div>
          )}
        </section>

        {/* Step 4: Review & approve */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-black text-cgb-ink text-sm tracking-wide uppercase">
            4 · Review &amp; Approve
          </h2>
          {generatedDrafts.length === 0 && approved.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">No drafts yet. Generate some above.</p>
          ) : (
            <div className="mt-3 space-y-4">
              {[...generatedDrafts, ...approved].map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  photoUrl={photoUrl}
                  onPatch={patchListing}
                />
              ))}
            </div>
          )}
        </section>

        {/* Step 5: Connect extension */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <h2 className="font-black text-cgb-ink text-sm tracking-wide uppercase">
            5 · Post via Extension
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            {approved.length} listing{approved.length !== 1 ? 's' : ''} approved and ready. Install
            the Crazy Good Buy extension in Chrome, paste a token below, then click “Start posting”.
          </p>
          <div className="mt-3">
            <CgbButton onClick={mintToken}>Generate Extension Token</CgbButton>
          </div>
          {token && (
            <div className="mt-3">
              <p className="text-xs text-gray-400 mb-1">
                Paste this into the extension (valid 7 days):
              </p>
              <code className="block bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-xs break-all">
                {token}
              </code>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ListingCard({
  listing, photoUrl, onPatch,
}: {
  listing: MarketplaceListing;
  photoUrl: (path: string) => string;
  onPatch: (id: string, updates: Partial<MarketplaceListing>) => void;
}) {
  const [draft, setDraft] = useState(listing);
  useEffect(() => setDraft(listing), [listing]);

  const isApproved = listing.status === 'approved';

  return (
    <div className="border border-gray-200 rounded-xl p-4">
      <div className="flex gap-3">
        <div className="flex gap-1 overflow-x-auto">
          {(listing.photo_paths || []).slice(0, 3).map((p) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={p}
              src={photoUrl(p)}
              alt=""
              className="w-16 h-16 object-cover rounded-lg flex-shrink-0"
            />
          ))}
        </div>
        <div className="flex-1 min-w-0">
          {listing.match_warning && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 mb-2">
              ⚠ {listing.match_warning}
            </p>
          )}
          <input
            value={draft.title || ''}
            maxLength={100}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            onBlur={() => onPatch(listing.id, { title: draft.title })}
            className="w-full font-semibold text-cgb-ink border-b border-transparent focus:border-cgb-orange outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <label className="text-xs text-gray-500">
          Price
          <input
            type="number"
            value={draft.price ?? ''}
            onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })}
            onBlur={() => onPatch(listing.id, { price: draft.price })}
            className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-cgb-ink"
          />
        </label>
        <label className="text-xs text-gray-500">
          Condition
          <select
            value={draft.condition || ''}
            onChange={(e) => {
              setDraft({ ...draft, condition: e.target.value });
              onPatch(listing.id, { condition: e.target.value });
            }}
            className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-cgb-ink"
          >
            {FB_CONDITIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-500">
          Category
          <input
            value={draft.category || ''}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
            onBlur={() => onPatch(listing.id, { category: draft.category })}
            className="w-full border border-gray-200 rounded px-2 py-1 text-sm text-cgb-ink"
          />
        </label>
      </div>

      <textarea
        value={draft.description || ''}
        onChange={(e) => setDraft({ ...draft, description: e.target.value })}
        onBlur={() => onPatch(listing.id, { description: draft.description })}
        rows={5}
        className="w-full mt-2 border border-gray-200 rounded px-3 py-2 text-sm text-cgb-ink"
      />

      <div className="flex justify-end mt-3">
        <button
          onClick={() => onPatch(listing.id, { status: isApproved ? 'draft' : 'approved' })}
          className={`text-sm font-bold uppercase tracking-wide px-4 py-2 rounded-full ${
            isApproved
              ? 'bg-green-100 text-green-700'
              : 'cgb-gradient-btn text-white'
          }`}
        >
          {isApproved ? '✓ Approved' : 'Approve'}
        </button>
      </div>
    </div>
  );
}
