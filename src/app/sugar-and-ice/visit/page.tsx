import type { Metadata } from 'next';
import { PageHero } from '../_components/PageHero';

export const metadata: Metadata = {
  title: 'Book Us',
  description:
    'Book the Sugar + Ice trailer for weddings, festivals, parties, and corporate events. Mini donuts, gelato, kettle corn, coffee, and Boylan dirty sodas — made on-site, to order.',
};

const included = [
  { eyebrow: 'Trailer', body: 'We pull up, we set up, we plug in. Power and a flat surface and we’re good.' },
  { eyebrow: 'Crew', body: 'Two to three of us, depending on headcount. Aprons on, fryer hot, music low.' },
  { eyebrow: 'Menu', body: 'You pick the lineup — donuts, gelato, kettle corn, coffee, dirty sodas. Some events do all five; most pick three.' },
  { eyebrow: 'Made on-site', body: 'Donuts go in the fryer when guests order. Gelato gets scooped in front of them. Nothing is pre-bagged.' },
];

export default function SugarIceVisit() {
  return (
    <>
      <PageHero
        num="03"
        eyebrow="Book Us"
        title="Book the trailer."
        lede="One Sugar + Ice trailer, ready to roll. Weddings, fairs, parties, corporate days, the occasional birthday — wherever you want dessert made on-site."
      />

      <section className="si-visit-section">
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">A</span>
            <span className="si-lbl">What We Bring</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <h2>Made on-site, made to order, the whole time.</h2>
            <p className="si-body">
              For two to six hours, your guests get fresh-fried mini donuts, hand-scooped gelato, kettle corn out of the kettle, real coffee, and Boylan dirty sodas &mdash; every piece of it made in front of them. No warming trays. No pre-bagged anything.
            </p>
          </div>

          <div className="si-principles" style={{ marginTop: 32 }}>
            {included.map((i) => (
              <div key={i.eyebrow} className="si-principle">
                <span className="si-eyebrow">{i.eyebrow}</span>
                <span className="si-prose">{i.body}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="si-visit-section" style={{ background: 'var(--cream-2)' }} id="quote">
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">B</span>
            <span className="si-lbl">Request a Quote</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <h2>Tell us about your event.</h2>
            <p className="si-body">
              We&rsquo;ll write back within a day or two with a menu and a price. The more you tell us up front &mdash; date, headcount, location, the kind of day it is &mdash; the tighter the quote.
            </p>
          </div>

          <form className="si-quote-form" action="#" method="post">
            <div className="si-form-grid">
              <label>
                <span>Your name</span>
                <input type="text" name="name" required />
              </label>
              <label>
                <span>Email</span>
                <input type="email" name="email" required />
              </label>
              <label>
                <span>Phone (optional)</span>
                <input type="tel" name="phone" />
              </label>
              <label>
                <span>Event date</span>
                <input type="date" name="date" />
              </label>
              <label>
                <span>Event type</span>
                <select name="type" defaultValue="">
                  <option value="" disabled>Pick one</option>
                  <option value="wedding">Wedding</option>
                  <option value="festival">Festival or fair</option>
                  <option value="corporate">Corporate / offsite</option>
                  <option value="birthday">Birthday party</option>
                  <option value="private">Private event</option>
                  <option value="other">Something else</option>
                </select>
              </label>
              <label>
                <span>Headcount</span>
                <input type="text" name="headcount" placeholder="Roughly how many guests" />
              </label>
              <label className="si-form-wide">
                <span>Location</span>
                <input type="text" name="location" placeholder="Venue, city, or address" />
              </label>
              <label className="si-form-wide">
                <span>Tell us more</span>
                <textarea name="notes" rows={5} placeholder="What kind of day is it? Any menu requests? Anything we should know?" />
              </label>
            </div>
            <button type="submit">
              Send the Request <span aria-hidden>→</span>
            </button>
          </form>
        </div>
      </section>

      <section className="si-visit-section" id="press">
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">C</span>
            <span className="si-lbl">Other Ways to Reach Us</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <div>
              <h2>Press, partnerships, or just saying hi.</h2>
              <p className="si-body" style={{ marginTop: 24 }}>
                Not booking an event? Use these instead. We read everything, we write back fast.
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
