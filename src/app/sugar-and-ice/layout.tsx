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
    'A craft dessert and coffee brand serving the food you loved as a kid — executed at the level of a boutique dessert shop. Donuts, ice cream, kettle corn, coffee, dirty sodas.',
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
