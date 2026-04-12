'use client';

export function LotCardSkeleton() {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden animate-pulse">
      <div className="flex items-center p-3 gap-3">
        <div className="w-12 h-12 bg-gray-200 rounded-lg" />
        <div className="w-12 h-12 bg-gray-200 rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-3 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

export function AuctionCardSkeleton() {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 rounded w-40" />
          <div className="h-3 bg-gray-200 rounded w-20" />
        </div>
        <div className="w-5 h-5 bg-gray-200 rounded" />
      </div>
    </div>
  );
}

export function LotReviewSkeleton() {
  return (
    <div className="p-4 space-y-4 animate-pulse">
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="w-20 h-20 bg-gray-200 rounded-lg flex-shrink-0" />
        ))}
      </div>
      <div className="bg-white rounded-xl p-4 space-y-3">
        <div className="h-5 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded w-1/2" />
        <div className="h-4 bg-gray-200 rounded w-1/3" />
        <div className="flex gap-4">
          <div className="h-8 bg-gray-200 rounded w-24" />
          <div className="h-8 bg-gray-200 rounded w-24" />
        </div>
      </div>
      <div className="bg-white rounded-xl p-4 space-y-2">
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded w-full" />
        <div className="h-4 bg-gray-200 rounded w-2/3" />
      </div>
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 grid grid-cols-3 gap-3 text-center animate-pulse">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-3 bg-gray-200 rounded w-16 mx-auto" />
          <div className="h-5 bg-gray-200 rounded w-12 mx-auto" />
        </div>
      ))}
    </div>
  );
}
