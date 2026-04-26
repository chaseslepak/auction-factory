import type { Metadata } from 'next';
import { SiteNav } from './_components/SiteNav';
import { SiteFooter } from './_components/SiteFooter';
import './sugar-ice.css';

export const metadata: Metadata = {
  title: {
    default: 'Sugar + Ice — Spun. Scooped. Poured.',
    template: '%s · Sugar + Ice',
  },
  description:
    'Mini donuts, hand-scooped gelato, kettle corn, real coffee, and Boylan dirty sodas — made to order. Find us at festivals, breweries, hotels, and on main streets.',
};

export default function SugarIceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="si-root">
      <SiteNav />
      {children}
      <SiteFooter />
    </div>
  );
}
