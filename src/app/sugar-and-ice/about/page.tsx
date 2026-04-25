import type { Metadata } from 'next';
import { PageHero } from '../_components/PageHero';

export const metadata: Metadata = {
  title: 'Our Story',
  description:
    'Sugar + Ice sits at the intersection of nostalgic Americana and modern craft food culture. Joyful, crafted, nostalgic, warm, approachable.',
};

const principles = [
  { eyebrow: 'Joyful', body: 'Not childish. The smile of a great first bite, not a clown’s grin.' },
  { eyebrow: 'Crafted', body: 'Not precious. Things made by hand, in front of you, well.' },
  { eyebrow: 'Nostalgic', body: 'Not retro kitsch. The memory, refined. The reference, not the costume.' },
  { eyebrow: 'Warm', body: 'But visually sharp. Comfort food, set in confident type.' },
  { eyebrow: 'Approachable', body: 'But premium. The line forms because it’s worth it, not because it’s cheap.' },
];

const sayYes = [
  'Spun to order.',
  'Hand-scooped, hand-poured.',
  'Brown butter. Sea salt. Real cream.',
  'We’re parked at the brewery ’til ten.',
];

const sayNo = [
  'Delicious. Yummy. Amazing.',
  'Treats! Indulge! Decadent!',
  'Multiple exclamation marks',
  'Emoji-stuffed captions',
];

export default function SugarIceAbout() {
  return (
    <>
      <PageHero
        num="02"
        eyebrow="Our Story"
        title="Comfort food, confidently set."
        lede="Sugar + Ice sits at the intersection of nostalgic Americana and modern craft food culture — the food you loved as a kid, made with the care you expect today."
      />

      <section className="si-about-section">
        <div className="si-row">
          <div className="si-grid-2">
            <p className="si-pull-quote">
              At home next to $18 cocktails<span className="si-dot">.</span> And a great cheese board<span className="si-dot">.</span>
            </p>
            <div>
              <p className="si-body">
                It belongs at a boutique festival, a hotel lobby, a beach town main street, an airport terminal, a stadium concourse &mdash; anywhere people want the food they loved as a kid, made with the care they expect today.
              </p>
              <p className="si-body" style={{ marginTop: 16 }}>
                The brand is built for everyone. Kids on a Saturday. Couples on a Friday. Late-night crowds. Parents who want one good thing, made well, that the whole family can agree on.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="si-about-section si-about-section--alt">
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">A</span>
            <span className="si-lbl">Five Principles</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <h2>Five things we hold to.</h2>
            <p className="si-body">
              Not a manifesto. A short list of the things that have to be true, every time, for a Sugar + Ice product to feel like a Sugar + Ice product.
            </p>
          </div>

          <div className="si-principles" style={{ marginTop: 32 }}>
            {principles.map((p) => (
              <div key={p.eyebrow} className="si-principle">
                <span className="si-eyebrow">{p.eyebrow}</span>
                <span className="si-prose">{p.body}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="si-about-section">
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">B</span>
            <span className="si-lbl">How We Talk</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <h2>Short. Punchy. Warm.</h2>
            <p className="si-body">
              A craftsperson who happens to be funny &mdash; not a hype account. Action verbs. Invitations, not pitches. Wit over wackiness.
            </p>
          </div>

          <div className="si-say-grid">
            <div className="si-say-card si-say-yes">
              <h4>Sounds Like Us</h4>
              <ul>
                {sayYes.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
            <div className="si-say-card si-say-no">
              <h4>Doesn’t Sound Like Us</h4>
              <ul>
                {sayNo.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="si-about-section si-about-section--dark">
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">C</span>
            <span className="si-lbl">From One to Fifty</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <h2>Trailer, kiosk, counter, or flagship.</h2>
            <p className="si-body">
              The brand is built to scale. One trailer to fifty locations &mdash; the system flexes without losing what makes it ours. Same crystal mark, same tagline, same standards. Different square footage.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
