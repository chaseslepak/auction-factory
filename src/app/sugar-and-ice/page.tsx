import Link from 'next/link';
import { CrystalMark } from './_components/CrystalMark';

const things = [
  { eyebrow: 'Donuts', body: 'Mini, fresh-fried, tossed in cinnamon sugar or glazed while you watch. Six to a bag, warm.' },
  { eyebrow: 'Gelato', body: 'Hand-scooped to order. Brown butter sweet cream, salted honey, olive oil and lemon.' },
  { eyebrow: 'Kettle Corn', body: 'Brown butter and sea salt. Caramel-pecan when we’re feeling it. Birthday-cake when you are.' },
  { eyebrow: 'Coffee', body: 'Hot, iced, or with a splash. Brown sugar cream cold brew. A real affogato.' },
  { eyebrow: 'Dirty Sodas', body: 'Boylan + cream + your pick of syrup. The drink your kid will fight you for.' },
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
              Mini donuts fried to order. Gelato hand-scooped. Kettle corn still warm from the kettle. Real coffee, Boylan dirty sodas, and a couple of things you&rsquo;ll want to try because you&rsquo;ve never had them this good.
            </p>
            <p className="si-hero-sub">
              Walk up. Order. Watch it get made. Two minutes later you&rsquo;ve got something better than you remember it being.
            </p>
          </div>

          <div className="si-cta-row">
            <Link href="/sugar-and-ice/visit" className="si-btn si-btn-accent">
              Book the Trailer <span className="si-arrow">→</span>
            </Link>
            <Link href="/sugar-and-ice/about" className="si-btn si-btn-ghost">
              Our Story
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
            <span className="si-lbl">What We Make</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <div>
              <h2>Five things, all made to order.</h2>
              <p className="si-body" style={{ marginTop: 24 }}>
                Short menu on purpose. Donuts go in the fryer when you order. Gelato gets scooped in front of you. Kettle corn comes out of the kettle a few feet away. Nothing&rsquo;s pre-made, nothing sits.
              </p>
              <p className="si-body" style={{ marginTop: 16 }}>
                If a line forms, it forms because the next bag is worth waiting for.
              </p>
            </div>

            <div className="si-principles">
              {things.map((t) => (
                <div key={t.eyebrow} className="si-principle">
                  <span className="si-eyebrow">{t.eyebrow}</span>
                  <span className="si-prose">{t.body}</span>
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
              The full menu, the story behind the trailer, and where to catch us next. Or just keep scrolling.
            </p>
          </div>

          <div className="si-feature-grid">
            <Link href="/sugar-and-ice/about" className="si-feature-card">
              <span className="si-feature-num">01 · Our Story</span>
              <h3>How it started.</h3>
              <p>One trailer, one fryer, and a stubborn opinion about brown butter. Why we make it small, and what we won&rsquo;t cut corners on.</p>
              <span className="si-feature-link">Read More →</span>
            </Link>

            <Link href="/sugar-and-ice/visit" className="si-feature-card">
              <span className="si-feature-num">02 · Book Us</span>
              <h3>Book the trailer.</h3>
              <p>Weddings, festivals, parties, corporate days. Wherever you want dessert made on-site, we&rsquo;ll bring it.</p>
              <span className="si-feature-link">Request a Quote →</span>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
