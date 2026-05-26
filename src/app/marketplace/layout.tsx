import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Crazy Good Buy | Marketplace Poster',
  description: 'Draft and post Crazy Good Buy listings to Facebook Marketplace',
};

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-cgb-bg">{children}</div>;
}
