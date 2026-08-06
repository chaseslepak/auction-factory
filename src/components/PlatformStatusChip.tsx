'use client';

import type { ListingStatus } from '@/lib/platform-types';

const STATUS_STYLES: Record<ListingStatus, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Draft' },
  content_ready: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Ready' },
  posting: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Posting' },
  posted: { bg: 'bg-green-100', text: 'text-green-700', label: 'Posted' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
  manually_posted: { bg: 'bg-green-100', text: 'text-green-700', label: 'Posted' },
};

const PLATFORM_LABELS: Record<string, string> = {
  craigslist: 'CL',
  fb_marketplace: 'MP',
  fb_page: 'FB',
};

export default function PlatformStatusChip({
  platform,
  status,
  region,
}: {
  platform: string;
  status: ListingStatus;
  region?: string | null;
}) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.draft;
  const platformLabel = PLATFORM_LABELS[platform] || platform;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}
      title={`${platform}${region ? ` (${region})` : ''}: ${status}`}
    >
      <span className="font-bold">{platformLabel}</span>
      {region && <span className="opacity-60 text-[10px]">{region}</span>}
      <span>{style.label}</span>
    </span>
  );
}
