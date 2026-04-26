import Link from 'next/link';
import type { Metadata } from 'next';
import { PageHero } from '../_components/PageHero';

export const metadata: Metadata = {
  title: 'Menu',
  description:
    'Made small. Made fresh. Made to order. Donuts, ice cream, kettle corn, coffee, and dirty sodas.',
};

type MenuItem = { name: string; desc: string; price: string };
type MenuCol = { eyebrow: string; title: string; blurb: string; items: MenuItem[] };

const cols: MenuCol[] = [
  {
    eyebrow: 'From the Fryer',
    title: 'Mini Donuts',
    blurb: 'Spun, fried, and tossed while you watch.',
    items: [
      { name: 'Cinnamon Sugar', desc: 'Six to a bag. Warm, always.', price: '$6' },
      { name: 'Brown Butter Glaze', desc: 'Maple, lemon, or vanilla bean.', price: '$7' },
      { name: 'Strawberry Jam Filled', desc: 'Powdered sugar, cold raspberry.', price: '$7' },
      { name: 'Boston Cream', desc: 'Vanilla custard, dark chocolate top.', price: '$8' },
    ],
  },
  {
    eyebrow: 'Hand-Scooped',
    title: 'Ice Cream',
    blurb: 'Two scoops, your pick of cone or cup.',
    items: [
      { name: 'Brown Butter Sweet Cream', desc: 'The house flavor.', price: '$7' },
      { name: 'Salted Honey', desc: 'Local honey, finishing salt.', price: '$7' },
      { name: 'Olive Oil & Lemon', desc: 'Bright, savory, grown-up.', price: '$8' },
      { name: 'Affogato', desc: 'A scoop, drowned in fresh coffee.', price: '$8' },
    ],
  },
  {
    eyebrow: 'Spun & Popped',
    title: 'Kettle Corn',
    blurb: 'Brown butter, a little salt, a little crunch.',
    items: [
      { name: 'Classic Kettle', desc: 'Brown butter, sea salt.', price: '$5' },
      { name: 'Caramel Cluster', desc: 'Caramel, pecan, flaky salt.', price: '$7' },
      { name: 'Birthday', desc: 'White chocolate, sprinkles, no apologies.', price: '$7' },
    ],
  },
  {
    eyebrow: 'Coffee & Cold',
    title: 'The Pours',
    blurb: 'Hot, iced, or with a splash. No fuss.',
    items: [
      { name: 'Coffee', desc: 'Hot, iced, or with a splash.', price: '$5' },
      { name: 'Brown Sugar Cream', desc: 'House cold brew, brown sugar foam.', price: '$6' },
      { name: 'Boylan Dirty Soda', desc: 'Boylan + cream + your pick of syrup.', price: '$6' },
      { name: 'Hot Chocolate', desc: 'Real cocoa, a marshmallow on top.', price: '$5' },
    ],
  },
];

export default function SugarIceMenu() {
  return (
    <>
      <PageHero
        num="01"
        eyebrow="The Menu"
        title="Made Small. Made Fresh. Made to Order."
        lede="The menu is short on purpose — a handful of things, each done well. Spun, scooped, poured, hand-made."
      />

      <section className="si-menu-page">
        <div className="si-row">
          <div className="si-menu-page-grid">
            {cols.map((col) => (
              <div key={col.title} className="si-menu-page-col">
                <p className="si-eyebrow" style={{
                  fontFamily: 'DM Mono, monospace',
                  fontSize: 11,
                  letterSpacing: '0.22em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                  margin: '0 0 8px',
                }}>{col.eyebrow}</p>
                <h3>{col.title}</h3>
                <p className="si-menu-blurb">{col.blurb}</p>
                {col.items.map((item) => (
                  <div key={item.name} className="si-menu-row">
                    <div>
                      <div className="si-name">{item.name}</div>
                      <div className="si-desc">{item.desc}</div>
                    </div>
                    <div className="si-price">{item.price}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div className="si-menu-callout">
            <div>
              <p className="si-callout-eyebrow">A Note</p>
            </div>
            <p>
              The menu rotates with what&rsquo;s good. Seasonal flavors, festival specials, and the occasional one-day-only experiment.
            </p>
            <Link href="/sugar-and-ice/visit#quote" className="si-btn si-btn-accent">
              Book the Trailer
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
