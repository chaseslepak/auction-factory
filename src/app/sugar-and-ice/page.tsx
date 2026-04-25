import Link from 'next/link';
import { CrystalMark } from './_components/CrystalMark';

const principles = [
  { eyebrow: 'Joyful', body: 'Not childish. The smile of a great first bite, not a clown’s grin.' },
  { eyebrow: 'Crafted', body: 'Not precious. Things made by hand, in front of you, well.' },
  { eyebrow: 'Nostalgic', body: 'Not retro kitsch. The memory, refined. The reference, not the costume.' },
  { eyebrow: 'Warm', body: 'But visually sharp. Comfort food, set in confident type.' },
  { eyebrow: 'Approachable', body: 'But premium. The line forms because it’s worth it, not because it’s cheap.' },
];

export default function SugarIceHome() {
  return (
    <>
      <header className="si-hero">
        <div className="si-row" id="top">
          <div className="si-hero-meta">
            <span>Craft Desserts &nbsp;·&nbsp; Coffee &nbsp;·&nbsp; Made to Order</span>
            <a href="https://thesugarandice.com">
              thesugarandice<span className="si-tld">.com</span>
            </a>
          </div>

          <h1>
            <span>Sugar</span>
            <span className="si-mark-slot" aria-hidden="true">
              <CrystalMark size={144} ink="var(--accent)" strokeRatio={0.085} />
            </span>
            <span>Ice</span>
          </h1>

          <div className="si-tag-row">
            <span className="si-tag-primary">● Spun. Scooped. Poured.</span>
            <span className="si-tag-quiet">Donuts · Ice Cream · Kettle Corn</span>
            <span className="si-tag-quiet">Coffee · Dirty Sodas</span>
          </div>

          <div className="si-hero-grid">
            <p className="si-hero-lede">
              A craft dessert and coffee brand serving the food you loved as a kid &mdash; executed at the level of a boutique dessert shop. At home next to $18 cocktails and a great cheese board.
            </p>
            <p className="si-hero-sub">
              Made small. Made fresh. Made to order. Built for everyone &mdash; kids, couples, late-night crowds &mdash; and built to scale: one location to fifty.
            </p>
          </div>

          <div className="si-cta-row">
            <Link href="/sugar-and-ice/menu" className="si-btn si-btn-accent">
              See the Menu <span className="si-arrow">→</span>
            </Link>
            <Link href="/sugar-and-ice/visit" className="si-btn si-btn-ghost">
              Find Us
            </Link>
          </div>
        </div>
      </header>

      <div className="si-strip">
        <div className="si-row si-strip-inner">
          <span><span className="si-dot">●</span>&nbsp;&nbsp;Hand-Scooped</span>
          <span><span className="si-dot">●</span>&nbsp;&nbsp;Fresh-Fried</span>
          <span><span className="si-dot">●</span>&nbsp;&nbsp;Small Batch</span>
          <span><span className="si-dot">●</span>&nbsp;&nbsp;Made to Order</span>
        </div>
      </div>

      <section className="si-section" id="story">
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">01</span>
            <span className="si-lbl">Our Foundation</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <div>
              <h2>At home next to $18 cocktails and a great cheese board.</h2>
              <p className="si-body" style={{ marginTop: 24 }}>
                Sugar + Ice sits at the intersection of nostalgic Americana and modern craft food culture. It belongs at a boutique festival, a hotel lobby, a beach town main street, an airport terminal, a stadium concourse &mdash; anywhere people want the food they loved as a kid, made with the care they expect today.
              </p>
              <p className="si-body" style={{ marginTop: 16 }}>
                The brand is built for everyone &mdash; kids, couples, late-night crowds, parents on a Saturday. Not childish. Not precious. Confident, warm, and a little bit fun.
              </p>
            </div>

            <div className="si-principles">
              {principles.map((p) => (
                <div key={p.eyebrow} className="si-principle">
                  <span className="si-eyebrow">{p.eyebrow}</span>
                  <span className="si-prose">{p.body}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="si-section" style={{ background: 'var(--cream-2)' }}>
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">02</span>
            <span className="si-lbl">Where to Go Next</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <h2>Pick a thread. Pull on it.</h2>
            <p className="si-body">
              The full menu, the brand we&rsquo;re building, and where to find us &mdash; each gets its own page. Or just keep scrolling.
            </p>
          </div>

          <div className="si-feature-grid">
            <Link href="/sugar-and-ice/menu" className="si-feature-card">
              <span className="si-feature-num">01 · Menu</span>
              <h3>Spun, Scooped, Poured.</h3>
              <p>The full menu — donuts spun in front of you, ice cream scooped to order, coffee poured fresh, dirty sodas built by hand.</p>
              <span className="si-feature-link">See the Menu →</span>
            </Link>

            <Link href="/sugar-and-ice/about" className="si-feature-card">
              <span className="si-feature-num">02 · Our Story</span>
              <h3>Comfort food, confidently set.</h3>
              <p>The brand foundation — what we make, why it matters, and what we mean when we say &ldquo;at home next to a great cheese board.&rdquo;</p>
              <span className="si-feature-link">Read More →</span>
            </Link>

            <Link href="/sugar-and-ice/visit" className="si-feature-card">
              <span className="si-feature-num">03 · Visit</span>
              <h3>We&rsquo;re probably parked somewhere good.</h3>
              <p>Catch us at festivals, breweries, hotels, and main streets. Get on the list and we&rsquo;ll tell you when we&rsquo;re close.</p>
              <span className="si-feature-link">Find Us →</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
