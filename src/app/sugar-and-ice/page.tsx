import { CrystalMark } from './CrystalMark';

const principles = [
  { eyebrow: 'Joyful', body: 'Not childish. The smile of a great first bite, not a clown’s grin.' },
  { eyebrow: 'Crafted', body: 'Not precious. Things made by hand, in front of you, well.' },
  { eyebrow: 'Nostalgic', body: 'Not retro kitsch. The memory, refined. The reference, not the costume.' },
  { eyebrow: 'Warm', body: 'But visually sharp. Comfort food, set in confident type.' },
  { eyebrow: 'Approachable', body: 'But premium. The line forms because it’s worth it, not because it’s cheap.' },
];

const fryer = [
  { name: 'Mini Donuts', desc: 'Cinnamon sugar, six to a bag.', price: '$6' },
  { name: 'Glaze of the Day', desc: 'Brown butter, maple, or strawberry.', price: '$7' },
  { name: 'Kettle Corn', desc: 'Brown butter, fresh popped.', price: '$5' },
];

const cold = [
  { name: 'Hand-Scooped', desc: 'Two scoops, your pick of cone.', price: '$7' },
  { name: 'Coffee', desc: 'Hot, iced, or with a splash.', price: '$5' },
  { name: 'Dirty Soda', desc: 'Boylan + cream + your choice of syrup.', price: '$6' },
];

export default function SugarIceLanding() {
  return (
    <>
      <header className="si-hero">
        <nav className="si-nav">
          <div className="si-row si-nav-inner">
            <a href="#top" className="si-mono" style={{ color: 'var(--cream)', textDecoration: 'none', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase' }}>
              Sugar <span style={{ color: 'var(--accent)' }}>+</span> Ice
            </a>
            <div className="si-nav-links">
              <a href="#menu">Menu</a>
              <a href="#story">Our Story</a>
              <a href="#visit">Visit</a>
            </div>
          </div>
        </nav>

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
            <a href="#menu" className="si-btn si-btn-accent">
              See the Menu <span className="si-arrow">→</span>
            </a>
            <a href="#visit" className="si-btn si-btn-ghost">
              Find Us
            </a>
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

      <section className="si-section si-menu-section" id="menu">
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">02</span>
            <span className="si-lbl">A Taste of the Menu</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <h2>Made small. Made fresh. Made to order.</h2>
            <p className="si-body">
              The menu is short on purpose &mdash; a handful of things, each done well. Donuts spun in front of you, ice cream scooped to order, coffee poured fresh, dirty sodas built by hand.
            </p>
          </div>

          <div className="si-menu-grid">
            <div className="si-menu-col">
              <h3>From the Kettle</h3>
              {fryer.map((item) => (
                <div key={item.name} className="si-menu-row">
                  <div>
                    <div className="si-name">{item.name}</div>
                    <div className="si-desc">{item.desc}</div>
                  </div>
                  <div className="si-price">{item.price}</div>
                </div>
              ))}
            </div>
            <div className="si-menu-col">
              <h3>Coffee &amp; Cold</h3>
              {cold.map((item) => (
                <div key={item.name} className="si-menu-row">
                  <div>
                    <div className="si-name">{item.name}</div>
                    <div className="si-desc">{item.desc}</div>
                  </div>
                  <div className="si-price">{item.price}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="si-section" id="visit">
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">03</span>
            <span className="si-lbl">Find Us</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <div>
              <h2>We&rsquo;re probably parked somewhere good.</h2>
              <p className="si-body" style={{ marginTop: 24 }}>
                Trailer, kiosk, counter, or flagship &mdash; the brand scales from one location to fifty. Catch us at festivals, breweries, and main streets. Follow along to see where we&rsquo;re pouring next.
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', justifyContent: 'center' }}>
              <a href="https://thesugarandice.com" className="si-btn si-btn-accent">
                Get on the List
              </a>
              <a href="#menu" className="si-btn" style={{ color: 'var(--espresso)' }}>
                Browse the Menu
              </a>
            </div>
          </div>
        </div>
      </section>

      <footer className="si-footer">
        <div className="si-row">
          <div className="si-footer-grid">
            <div>
              <p className="si-footer-tagline">
                Spun<span className="si-dot">.</span> Scooped<span className="si-dot">.</span> Poured<span className="si-dot">.</span>
              </p>
              <a href="https://thesugarandice.com" className="si-footer-domain">
                thesugarandice<span className="si-tld">.com</span>
              </a>
            </div>
            <div>
              <h4>Visit</h4>
              <p>Festivals &amp; Pop-ups</p>
              <p>Breweries &amp; Hotels</p>
              <p>Wherever the line forms.</p>
            </div>
            <div>
              <h4>Follow</h4>
              <p><a href="#">Instagram</a></p>
              <p><a href="#">TikTok</a></p>
              <p><a href="#">Newsletter</a></p>
            </div>
          </div>

          <div className="si-footer-bottom">
            <span>Sugar <span style={{ color: 'var(--accent)' }}>+</span> Ice &nbsp;·&nbsp; Brand v1.0</span>
            <span>Made Small · Made Fresh · Made to Order</span>
          </div>
        </div>
      </footer>
    </>
  );
}
