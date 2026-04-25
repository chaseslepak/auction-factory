import type { Metadata } from 'next';
import { PageHero } from '../_components/PageHero';

export const metadata: Metadata = {
  title: 'Visit',
  description:
    'Catch us at festivals, breweries, hotels, and main streets. Get on the list to know when we’re close.',
};

const placements = [
  {
    eyebrow: 'Pop-Up',
    title: 'Festivals',
    body: 'Boutique food festivals, art fairs, summer markets. The trailer rolls in, the line forms, the line gets fed.',
  },
  {
    eyebrow: 'Stay',
    title: 'Hotels & Resorts',
    body: 'Lobby kiosks for the four-o’clock crowd. Late-night carts for the people who came back for one more.',
  },
  {
    eyebrow: 'Main Street',
    title: 'Brick & Mortar',
    body: 'Counter shops on walking streets, beach towns, college blocks. Same menu. More square footage.',
  },
  {
    eyebrow: 'Stadium',
    title: 'Concourses',
    body: 'Sports, concerts, conferences. A point of light in a sea of nachos.',
  },
  {
    eyebrow: 'Field',
    title: 'Breweries',
    body: 'We bring dessert. They bring the IPA. Everyone wins.',
  },
  {
    eyebrow: 'Private',
    title: 'Events & Catering',
    body: 'Weddings, corporate offsites, birthday parties. Trailer, cart, or counter — your call.',
  },
];

export default function SugarIceVisit() {
  return (
    <>
      <PageHero
        num="03"
        eyebrow="Visit"
        title="We’re probably parked somewhere good."
        lede="Trailer, kiosk, counter, or flagship — Sugar + Ice scales from one location to fifty. Catch us where the line forms."
      />

      <section className="si-visit-section">
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">A</span>
            <span className="si-lbl">Where to Find Us</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <h2>Anywhere people want what they loved as a kid, made well today.</h2>
            <p className="si-body">
              The brand is built for any context where great food belongs. The footprint changes; the standards don&rsquo;t.
            </p>
          </div>

          <div className="si-visit-grid">
            {placements.map((p) => (
              <div key={p.title} className="si-visit-card">
                <span className="si-eyebrow">{p.eyebrow}</span>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="si-visit-section" style={{ background: 'var(--cream-2)' }} id="list">
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">B</span>
            <span className="si-lbl">Get on the List</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <h2>Tell us where you are. We&rsquo;ll tell you when we&rsquo;re close.</h2>
            <p className="si-body">
              No spam, no ten-emails-a-week. Just a heads-up when the trailer&rsquo;s rolling into your town &mdash; or when a new flavor is about to disappear.
            </p>
          </div>

          <form className="si-visit-form" action="#" method="post">
            <input type="text" name="name" placeholder="Your name" aria-label="Your name" />
            <input type="email" name="email" placeholder="Email" aria-label="Email" required />
            <button type="submit">
              Sign Up <span aria-hidden>→</span>
            </button>
          </form>
        </div>
      </section>

      <section className="si-visit-section">
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">C</span>
            <span className="si-lbl">Bookings & Press</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <div>
              <h2>Want us at your event?</h2>
              <p className="si-body" style={{ marginTop: 24 }}>
                Festivals, weddings, openings, corporate days, and the occasional birthday party. Tell us the date, the headcount, and what kind of mess we&rsquo;re working with &mdash; we&rsquo;ll write back fast.
              </p>
            </div>
            <div style={{ display: 'grid', gap: 16, alignContent: 'center' }}>
              <a href="mailto:hello@thesugarandice.com" className="si-btn si-btn-accent">
                hello@thesugarandice.com
              </a>
              <a href="mailto:press@thesugarandice.com" className="si-btn" style={{ color: 'var(--espresso)' }}>
                press@thesugarandice.com
              </a>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
