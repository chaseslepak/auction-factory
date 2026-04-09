export interface Auction {
  id: string;
  name: string;
  created_by: string;
  created_at: string;
  status: 'active' | 'closed';
  lot_count?: number;
}

export interface Lot {
  id: string;
  auction_id: string;
  lot_number: number;
  item_name: string | null;
  brand: string | null;
  model: string | null;
  category: string | null;
  confidence: 'high' | 'medium' | 'low' | null;
  condition_rating: number | null;
  quantity: number;
  estimated_retail_new: number | null;
  listed_price: number | null;
  key_features: string[];
  auction_description: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  af_upload_status: 'queued' | 'uploading' | 'uploaded' | 'failed' | null;
  af_upload_error: string | null;
}

export interface LotPhoto {
  id: string;
  lot_id: string;
  storage_path: string;
  display_order: number;
}

export interface LotWithPhotos extends Lot {
  lot_photos: LotPhoto[];
}

export interface GenerateListingRequest {
  images: string[];
  condition: number;
  quantity: number;
  notes: string;
  auction_name: string;
}

export interface GenerateListingResponse {
  item_name: string;
  brand: string;
  model: string;
  category: string;
  confidence: 'high' | 'medium' | 'low';
  estimated_retail_new: number;
  listed_price: number;
  key_features: string[];
  auction_description: string;
}
