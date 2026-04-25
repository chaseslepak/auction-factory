import type { Metadata } from 'next';
import './sugar-ice.css';

export const metadata: Metadata = {
  title: 'Sugar + Ice — Spun. Scooped. Poured.',
  description:
    'A craft dessert and coffee brand serving the food you loved as a kid — executed at the level of a boutique dessert shop. Donuts, ice cream, kettle corn, coffee, dirty sodas.',
};

export default function SugarIceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="si-root">{children}</div>;
}
