import type { Metadata } from 'next';

// Authenticated, data-driven UI — render on demand rather than statically
// prerendering at build time (which would build the browser client too early).
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Crazy Good Buy | Marketplace Poster',
  description: 'Draft and post Crazy Good Buy listings to Facebook Marketplace',
};

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-cgb-bg">{children}</div>;
}
