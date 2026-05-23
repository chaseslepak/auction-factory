// In-memory handoff for new-lot → review page. Photos are kept here instead of
// sessionStorage because their base64 payload routinely blows past the ~5 MB
// browser quota and throws QuotaExceededError.

import type { GenerateListingResponse } from './types';

export type PendingLot = {
  listing: GenerateListingResponse;
  photos: string[];
  condition: number;
  quantity: number;
  notes: string;
  nextLotNumber: number;
};

let pending: PendingLot | null = null;

export function setPendingLot(data: PendingLot) {
  pending = data;
}

export function getPendingLot(): PendingLot | null {
  return pending;
}

export function clearPendingLot() {
  pending = null;
}
