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
    'Donuts, hand-scooped gelato, kettle corn, craft coffee, and Boylan dirty sodas — made to order with intentional, gourmet flavors. Book the trailer for weddings, fairs, parties, and corporate days.',
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
