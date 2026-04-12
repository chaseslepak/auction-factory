'use client';

import { useState } from 'react';
import GradientButton from './GradientButton';
import { CL_REGIONS } from '@/lib/platform-types';
import type { PlatformListing, ScrapedItem } from '@/lib/platform-types';

interface CLQueueItem {
  listing: PlatformListing;
  item: ScrapedItem;
}

export default function CraigslistPostingQueue({
  items,
  onMarkPosted,
  onClose,
}: {
  items: CLQueueItem[];
  onMarkPosted: (listingId: string) => void;
  onClose: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 text-center">
        <p className="text-gray-500">No Craigslist listings ready to post.</p>
        <button onClick={onClose} className="text-brand-blue text-sm mt-2 underline">
          Close
        </button>
      </div>
    );
  }

  const current = items[currentIndex];
  if (!current) return null;

  const { listing, item } = current;
  const region = listing.cl_region || 'cleveland';
  const regionInfo = CL_REGIONS[region];
  const pending = items.filter((i) => i.listing.status === 'content_ready').length;

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    }
  };

  const handleMarkPosted = () => {
    onMarkPosted(listing.id);
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleSkip = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const clPostUrl = regionInfo
    ? `https://post.craigslist.org/${region}/`
    : 'https://post.craigslist.org/';

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="bg-brand-navy px-4 py-3 flex items-center justify-between">
        <div className="text-white">
          <span className="font-bold text-sm">
            Craigslist Posting Queue
          </span>
          <span className="text-white/60 text-xs ml-2">
            {currentIndex + 1} of {items.length} ({pending} pending)
          </span>
        </div>
        <button onClick={onClose} className="text-white/60 hover:text-white text-sm">
          Close
        </button>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-gray-100">
        <div
          className="h-full bg-brand-blue transition-all"
          style={{ width: `${((currentIndex + 1) / items.length) * 100}%` }}
        />
      </div>

      <div className="p-4 space-y-4">
        {/* Region badge */}
        <div className="flex items-center gap-2">
          <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold">
            {regionInfo?.name || region}
          </span>
          <span className="text-xs text-gray-400">
            Lot #{item.lot_number}
          </span>
          {listing.status === 'manually_posted' && (
            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-bold">
              Posted
            </span>
          )}
        </div>

        {/* Title */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Title</label>
            <button
              onClick={() => copyToClipboard(listing.generated_title || '', 'title')}
              className="text-xs text-brand-blue hover:underline"
            >
              {copied === 'title' ? 'Copied!' : 'Copy Title'}
            </button>
          </div>
          <div className="bg-brand-bg rounded-lg p-3 font-mono text-sm">
            {listing.generated_title}
          </div>
        </div>

        {/* Body */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-bold text-gray-500 uppercase">Body</label>
            <button
              onClick={() => copyToClipboard(listing.generated_body || '', 'body')}
              className="text-xs text-brand-blue hover:underline"
            >
              {copied === 'body' ? 'Copied!' : 'Copy Body'}
            </button>
          </div>
          <div className="bg-brand-bg rounded-lg p-3 text-sm whitespace-pre-wrap max-h-60 overflow-y-auto">
            {listing.generated_body}
          </div>
        </div>

        {/* Photos */}
        {item.photos && item.photos.length > 0 && (
          <div>
            <label className="text-xs font-bold text-gray-500 uppercase mb-1 block">
              Photos ({item.photos.length})
            </label>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {item.photos.slice(0, 8).map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0"
                >
                  <img
                    src={url}
                    alt={`Photo ${i + 1}`}
                    className="w-20 h-20 object-cover rounded-lg border border-gray-200 hover:border-brand-blue"
                  />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2 border-t border-gray-100">
          <a
            href={clPostUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 bg-orange-500 text-white text-center py-2.5 rounded-lg font-bold text-sm hover:bg-orange-600"
          >
            Open Craigslist
          </a>
          <button
            onClick={handleMarkPosted}
            className="flex-1 bg-brand-green text-white py-2.5 rounded-lg font-bold text-sm hover:opacity-90"
          >
            Mark Posted
          </button>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleBack}
            disabled={currentIndex === 0}
            className="text-sm text-brand-blue disabled:text-gray-300"
          >
            Back
          </button>
          <button
            onClick={handleSkip}
            disabled={currentIndex >= items.length - 1}
            className="text-sm text-gray-500 hover:text-brand-blue disabled:text-gray-300"
          >
            Skip
          </button>
        </div>
      </div>
    </div>
  );
}
