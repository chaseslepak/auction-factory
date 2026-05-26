// Shared types + pure helpers for the Crazy Good Buy → Facebook Marketplace flow.
// Used by both server routes and client pages, so keep this free of server-only imports.

export interface StorefrontProduct {
  id: string;
  handle: string;
  title: string;
  descriptionText: string;
  productType: string;
  tags: string[];
  price: number;
  sku: string;
  stockImages: string[];
}

export interface MarketplaceListing {
  id: string;
  handle: string;
  product_id: string | null;
  product_type: string | null;
  title: string | null;
  price: number | null;
  category: string | null;
  condition: string | null;
  description: string | null;
  keywords: string[];
  photo_paths: string[];
  match_warning: string | null;
  status: 'draft' | 'approved' | 'posted';
  created_at: string;
  updated_at: string;
  posted_at: string | null;
}

// Facebook Marketplace condition values (must match the form's options).
export const FB_CONDITIONS = [
  'New',
  'Used - Like New',
  'Used - Good',
  'Used - Fair',
] as const;

// Suggested Facebook Marketplace category by Shopify product_type.
// The extension types this into FB's category search box and picks the closest match.
const CATEGORY_BY_TYPE: Record<string, string> = {
  cooking: 'Kitchen Appliances',
  'cooking equipment': 'Kitchen Appliances',
  refrigeration: 'Kitchen Appliances',
  freezer: 'Kitchen Appliances',
  cooler: 'Kitchen Appliances',
  'ice machine': 'Kitchen Appliances',
  'ice machines': 'Kitchen Appliances',
  'kitchen tools': 'Kitchen & Dining',
  smallwares: 'Kitchen & Dining',
  prep: 'Kitchen Appliances',
};

export function suggestCategory(productType: string): string {
  const key = (productType || '').trim().toLowerCase();
  return CATEGORY_BY_TYPE[key] || 'Kitchen Appliances';
}

// Normalize handle/folder names for matching (case-insensitive, strip separators).
export function normalizeKey(s: string): string {
  return (s || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
}

// Strip Shopify body_html to readable plain text.
export function htmlToText(html: string): string {
  return (html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

// Select a batch optimized for value (price) AND variety (spread across product_type).
// Buckets by product_type, sorts each by price desc, then round-robins across buckets.
export function selectByValueAndVariety<
  T extends { productType: string; price: number }
>(products: T[], batchSize: number): T[] {
  const buckets = new Map<string, T[]>();
  for (const p of products) {
    const key = (p.productType || 'other').toLowerCase();
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(p);
  }
  // Sort each bucket by price desc.
  const bucketLists = Array.from(buckets.values());
  bucketLists.forEach((list) => list.sort((a, b) => b.price - a.price));
  // Order buckets by their top item's price desc so high-value categories go first.
  const ordered = bucketLists.sort(
    (a, b) => (b[0]?.price || 0) - (a[0]?.price || 0)
  );

  const selected: T[] = [];
  let i = 0;
  while (selected.length < batchSize && ordered.some((b) => b.length > i)) {
    for (const bucket of ordered) {
      if (selected.length >= batchSize) break;
      if (bucket[i]) selected.push(bucket[i]);
    }
    i++;
  }
  return selected;
}

export const DEFAULT_BATCH_SIZE = 5;
export const MAX_PHOTOS = 10;
