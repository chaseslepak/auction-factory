'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import GradientButton from '@/components/GradientButton';
import PlatformStatusChip from '@/components/PlatformStatusChip';
import CraigslistPostingQueue from '@/components/CraigslistPostingQueue';
import type {
  PlatformType,
  PlatformListing,
  ScrapedItem,
  ListingStatus,
} from '@/lib/platform-types';

interface AFAuction {
  id: string;
  name: string;
  url: string;
}

interface ScrapedAuctionData {
  auction_id: string;
  auction_name: string;
  item_count: number;
  items: any[];
}

export default function DistributePage() {
  // Auction selection
  const [afAuctions, setAfAuctions] = useState<AFAuction[]>([]);
  const [loadingAuctions, setLoadingAuctions] = useState(true);
  const [selectedAuctionUrl, setSelectedAuctionUrl] = useState('');

  // Scraping
  const [scraping, setScraping] = useState(false);
  const [scrapedData, setScrapedData] = useState<ScrapedAuctionData | null>(null);
  const [scrapeError, setScrapeError] = useState('');

  // Content generation
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState({ current: 0, total: 0 });

  // Platform listings
  const [listings, setListings] = useState<(PlatformListing & { af_scraped_items?: ScrapedItem })[]>([]);
  const [statusSummary, setStatusSummary] = useState<Record<string, Record<string, number>>>({});

  // FB posting
  const [fbConnected, setFbConnected] = useState(false);
  const [fbPageName, setFbPageName] = useState('');
  const [postingFb, setPostingFb] = useState(false);

  // CL queue
  const [showClQueue, setShowClQueue] = useState(false);

  // Platforms to generate for
  const [platforms, setPlatforms] = useState<PlatformType[]>(['craigslist', 'fb_marketplace', 'fb_page']);

  useEffect(() => {
    loadAuctions();
    checkFbStatus();
  }, []);

  const loadAuctions = async () => {
    setLoadingAuctions(true);
    try {
      const res = await fetch('/api/af-scrape');
      const data = await res.json();
      setAfAuctions(data.auctions || []);
    } catch {
      setAfAuctions([]);
    }
    setLoadingAuctions(false);
  };

  const checkFbStatus = async () => {
    try {
      const res = await fetch('/api/fb/auth-status');
      const data = await res.json();
      setFbConnected(data.connected);
      setFbPageName(data.pageName || '');
    } catch {}
  };

  const handleScrape = async () => {
    if (!selectedAuctionUrl) return;
    setScraping(true);
    setScrapeError('');
    setScrapedData(null);
    setListings([]);

    try {
      const res = await fetch('/api/af-scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auction_url: selectedAuctionUrl, fetch_details: false }),
      });
      const data = await res.json();

      if (data.error) {
        setScrapeError(data.error);
      } else {
        setScrapedData(data);
        // Load any existing platform listings for this auction
        await loadListings(data.auction_id);
      }
    } catch (err: any) {
      setScrapeError(err.message);
    }

    setScraping(false);
  };

  const loadListings = async (auctionId: string) => {
    try {
      const res = await fetch(`/api/platform-listings/status?auction_id=${auctionId}`);
      const data = await res.json();
      setListings(data.listings || []);
      setStatusSummary(data.summary || {});
    } catch {}
  };

  const handleGenerate = async () => {
    if (!scrapedData) return;
    setGenerating(true);

    try {
      // Fetch all scraped item IDs for this auction
      const itemIds = scrapedData.items.map((i: any) => i.af_item_id);

      // We need to get the DB IDs - fetch from scraped_items table
      const res = await fetch('/api/platform-listings/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scraped_auction_id: scrapedData.auction_id,
          scraped_item_ids: 'all', // special value to process all items
          platforms,
        }),
      });
      const data = await res.json();

      if (data.error) {
        alert(`Generation error: ${data.error}`);
      } else {
        // Reload listings
        await loadListings(scrapedData.auction_id);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }

    setGenerating(false);
  };

  const handlePostToFb = async () => {
    if (!scrapedData) return;
    setPostingFb(true);

    try {
      // Get FB page listings that are content_ready
      const fbListings = listings.filter(
        (l) => l.platform === 'fb_page' && l.status === 'content_ready'
      );

      if (fbListings.length === 0) {
        alert('No FB page content ready to post. Generate content first.');
        setPostingFb(false);
        return;
      }

      const res = await fetch('/api/fb/post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_ids: fbListings.map((l) => l.id) }),
      });
      const data = await res.json();

      if (data.error) {
        alert(`FB posting error: ${data.error}`);
      } else {
        alert(`Posted ${data.succeeded} of ${data.total} items to Facebook!`);
        await loadListings(scrapedData.auction_id);
      }
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }

    setPostingFb(false);
  };

  const handleMarkClPosted = async (listingId: string) => {
    try {
      await fetch('/api/platform-listings/mark-posted', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listing_ids: [listingId] }),
      });
      if (scrapedData) {
        await loadListings(scrapedData.auction_id);
      }
    } catch {}
  };

  const togglePlatform = (p: PlatformType) => {
    setPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
  };

  const getStatusCount = (platform: string, status: string) => {
    return statusSummary[platform]?.[status] || 0;
  };

  const getTotalForPlatform = (platform: string) => {
    return statusSummary[platform]?.total || 0;
  };

  // Prepare CL queue items
  const clQueueItems = listings
    .filter((l) => l.platform === 'craigslist' && l.status === 'content_ready')
    .map((l) => ({
      listing: l as PlatformListing,
      item: (scrapedData?.items?.find(
        (i: any) => i.lot_number === (l as any).lot_number
      ) || { photos: [], lot_number: null }) as ScrapedItem,
    }));

  return (
    <div className="min-h-screen bg-brand-bg">
      <Header title="Distribute" backHref="/auctions" />

      <div className="p-4 space-y-4 max-w-4xl mx-auto">
        {/* Step 1: Select Auction */}
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
          <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-3">
            1. Select Auction from AF
          </h2>

          {loadingAuctions ? (
            <p className="text-sm text-gray-400">Loading auctions from auctionfactory.com...</p>
          ) : (
            <>
              <select
                value={selectedAuctionUrl}
                onChange={(e) => setSelectedAuctionUrl(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-blue"
              >
                <option value="">Choose an auction...</option>
                {afAuctions.map((a) => (
                  <option key={a.id} value={a.url}>
                    {a.name}
                  </option>
                ))}
              </select>

              <div className="mt-3">
                <GradientButton
                  onClick={handleScrape}
                  loading={scraping}
                  disabled={!selectedAuctionUrl}
                >
                  {scraping ? 'Scraping items...' : 'Scrape Auction Items'}
                </GradientButton>
              </div>
            </>
          )}

          {scrapeError && (
            <p className="text-red-500 text-sm mt-2">{scrapeError}</p>
          )}

          {scrapedData && (
            <div className="mt-3 bg-brand-bg rounded-lg p-3">
              <p className="text-sm font-bold text-brand-navy">
                {scrapedData.auction_name}
              </p>
              <p className="text-xs text-gray-500">
                {scrapedData.item_count} items scraped
              </p>
            </div>
          )}
        </div>

        {/* Step 2: Generate Content */}
        {scrapedData && (
          <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
            <h2 className="font-black text-sm text-brand-navy uppercase tracking-wide mb-3">
              2. Generate Marketing Content
            </h2>

            <p className="text-xs text-gray-500 mb-3">
              Select platforms to generate content for:
            </p>

            <div className="flex flex-wrap gap-2 mb-4">
              {(['craigslist', 'fb_marketplace', 'fb_page'] as PlatformType[]).map((p) => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                    platforms.includes(p)
                      ? 'bg-brand-blue text-white'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {p === 'craigslist'
                    ? 'Craigslist'
                    : p === 'fb_marketplace'
                    ? 'FB Marketplace'
                    : 'FB Business Page'}
                </button>
              ))}
            </div>

            <GradientButton
              onClick={handleGenerate}
              loading={generating}
              disabled={platforms.length === 0}
            >
              {generating
                ? 'Generating content...'
                : `Generate for ${scrapedData.item_count} Items`}
            </GradientButton>
          </div>
        )}

        {/* Step 3: Platform Status & Actions */}
        {scrapedData && Object.keys(statusSummary).length > 0 && (
          <div className="space-y-4">
            {/* Platform cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* FB Business Page Card */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-bold text-sm text-brand-navy">FB Page</h3>
                  {fbConnected ? (
                    <span className="text-xs text-brand-green font-bold">{fbPageName}</span>
                  ) : (
                    <span className="text-xs text-red-400 font-bold">Not connected</span>
                  )}
                </div>
                <div className="flex gap-1 flex-wrap mb-3">
                  {(['content_ready', 'posted', 'failed'] as const).map((s) => {
                    const count = getStatusCount('fb_page', s);
                    if (count === 0) return null;
                    return (
                      <PlatformStatusChip key={s} platform="fb_page" status={s} />
                    );
                  })}
                  <span className="text-xs text-gray-400">
                    {getStatusCount('fb_page', 'posted')}/{getTotalForPlatform('fb_page')} posted
                  </span>
                </div>
                <button
                  onClick={handlePostToFb}
                  disabled={!fbConnected || postingFb || getStatusCount('fb_page', 'content_ready') === 0}
                  className="w-full py-2 bg-blue-600 text-white rounded-lg text-xs font-bold disabled:opacity-50 hover:bg-blue-700"
                >
                  {postingFb ? 'Posting...' : `Post ${getStatusCount('fb_page', 'content_ready')} to FB Page`}
                </button>
              </div>

              {/* Craigslist Card */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="font-bold text-sm text-brand-navy mb-2">Craigslist</h3>
                <div className="flex gap-1 flex-wrap mb-3">
                  {Object.keys(statusSummary)
                    .filter((k) => k.startsWith('craigslist'))
                    .map((k) => {
                      const region = k.split(':')[1];
                      const total = statusSummary[k]?.total || 0;
                      const posted = (statusSummary[k]?.posted || 0) + (statusSummary[k]?.manually_posted || 0);
                      return (
                        <span key={k} className="text-xs text-gray-500">
                          {region}: {posted}/{total}
                        </span>
                      );
                    })}
                </div>
                <button
                  onClick={() => setShowClQueue(true)}
                  disabled={clQueueItems.length === 0}
                  className="w-full py-2 bg-orange-500 text-white rounded-lg text-xs font-bold disabled:opacity-50 hover:bg-orange-600"
                >
                  Open Posting Queue ({clQueueItems.length} ready)
                </button>
              </div>

              {/* FB Marketplace Card */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <h3 className="font-bold text-sm text-brand-navy mb-2">FB Marketplace</h3>
                <div className="text-xs text-gray-500 mb-3">
                  {getStatusCount('fb_marketplace', 'content_ready')} listings ready to copy
                </div>
                <p className="text-[10px] text-gray-400">
                  Copy content from the item list below to post manually on FB Marketplace.
                </p>
              </div>
            </div>

            {/* CL Posting Queue overlay */}
            {showClQueue && (
              <CraigslistPostingQueue
                items={clQueueItems}
                onMarkPosted={handleMarkClPosted}
                onClose={() => setShowClQueue(false)}
              />
            )}

            {/* Item listing table */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100">
                <h3 className="font-bold text-sm text-brand-navy">
                  All Items ({scrapedData.item_count})
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-brand-bg text-xs text-gray-500 uppercase">
                      <th className="px-3 py-2 text-left">#</th>
                      <th className="px-3 py-2 text-left">Item</th>
                      <th className="px-3 py-2 text-center">CL</th>
                      <th className="px-3 py-2 text-center">MP</th>
                      <th className="px-3 py-2 text-center">FB</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scrapedData.items.map((item: any, idx: number) => {
                      // Find listings for this item
                      const itemListings = listings.filter(
                        (l: any) => l.generated_title?.includes(item.title?.substring(0, 20))
                      );
                      const clListing = itemListings.find((l) => l.platform === 'craigslist');
                      const mpListing = itemListings.find((l) => l.platform === 'fb_marketplace');
                      const fbListing = itemListings.find((l) => l.platform === 'fb_page');

                      return (
                        <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-400 text-xs">
                            {item.lot_number || idx + 1}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              {item.photos?.[0] && (
                                <img
                                  src={item.photos[0]}
                                  alt=""
                                  className="w-8 h-8 rounded object-cover flex-shrink-0"
                                />
                              )}
                              <span className="text-xs font-medium truncate max-w-[200px]">
                                {item.title}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {clListing ? (
                              <PlatformStatusChip
                                platform="craigslist"
                                status={clListing.status as ListingStatus}
                              />
                            ) : (
                              <span className="text-gray-300 text-xs">--</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {mpListing ? (
                              <PlatformStatusChip
                                platform="fb_marketplace"
                                status={mpListing.status as ListingStatus}
                              />
                            ) : (
                              <span className="text-gray-300 text-xs">--</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {fbListing ? (
                              <PlatformStatusChip
                                platform="fb_page"
                                status={fbListing.status as ListingStatus}
                              />
                            ) : (
                              <span className="text-gray-300 text-xs">--</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
