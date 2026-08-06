// Types for cross-platform listing automation

export interface ScrapedAuction {
  id: string;
  af_url: string;
  af_name: string | null;
  item_count: number;
  scraped_at: string;
}

export interface ScrapedItem {
  id: string;
  scraped_auction_id: string;
  af_item_url: string | null;
  lot_number: number | null;
  title: string | null;
  description: string | null;
  photos: string[]; // array of photo URLs
  price: string | null;
  current_bid?: string | null; // alias for price, used in content generation
  condition: string | null;
  brand: string | null;
  model: string | null;
  dimensions: string | null;
  scraped_at: string;
}

export type PlatformType = 'craigslist' | 'fb_marketplace' | 'fb_page';

export type ListingStatus =
  | 'draft'
  | 'content_ready'
  | 'posting'
  | 'posted'
  | 'failed'
  | 'manually_posted';

export interface PlatformListing {
  id: string;
  scraped_item_id: string;
  scraped_auction_id: string;
  platform: PlatformType;
  cl_region: string | null;
  generated_title: string | null;
  generated_body: string | null;
  generated_data: Record<string, any> | null;
  generated_at: string | null;
  status: ListingStatus;
  external_id: string | null;
  external_url: string | null;
  post_error: string | null;
  posted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformListingWithItem extends PlatformListing {
  af_scraped_items: ScrapedItem;
}

export interface PlatformConfig {
  platform: string;
  config: Record<string, any>;
  enabled: boolean;
  updated_at: string;
}

// Content generation responses

export interface CraigslistContent {
  title: string;
  body: string;
  suggested_price: number;
  category: string;
}

export interface FbMarketplaceContent {
  title: string;
  description: string;
  price: number;
  condition: 'new' | 'used_like_new' | 'used_good' | 'used_fair';
  category: string;
}

export interface FbPageContent {
  post_text: string;
  hashtags: string[];
}

export interface GeneratedPlatformContent {
  craigslist?: CraigslistContent;
  fb_marketplace?: FbMarketplaceContent;
  fb_page?: FbPageContent;
}

// Craigslist region configuration
export const CL_REGIONS: Record<string, { name: string; url: string }> = {
  cleveland: {
    name: 'Cleveland, OH',
    url: 'https://cleveland.craigslist.org',
  },
  akroncanton: {
    name: 'Akron/Canton, OH',
    url: 'https://akroncanton.craigslist.org',
  },
  columbus: {
    name: 'Columbus, OH',
    url: 'https://columbus.craigslist.org',
  },
  youngstown: {
    name: 'Youngstown, OH',
    url: 'https://youngstown.craigslist.org',
  },
  toledo: {
    name: 'Toledo, OH',
    url: 'https://toledo.craigslist.org',
  },
};
