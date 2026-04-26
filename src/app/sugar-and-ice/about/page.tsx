import type { Metadata } from 'next';
import { PageHero } from '../_components/PageHero';

export const metadata: Metadata = {
  title: 'Our Story',
  description:
    'How Sugar + Ice started — one trailer, one fryer, and a stubborn opinion about brown butter. Mini donuts, hand-scooped gelato, kettle corn, real coffee, and Boylan dirty sodas.',
};

const craft = [
  { eyebrow: 'Donuts', body: 'Fresh batter, hot oil, six to a bag — handed over before the sugar has time to settle. We don’t hold them.' },
  { eyebrow: 'Gelato', body: 'Brown butter sweet cream is the house flavor. Salted honey, olive oil and lemon, affogato. Real cream, real sugar, the good vanilla.' },
  { eyebrow: 'Kettle Corn', body: 'Brown butter, sea salt, and a kettle that someone is actually watching. Caramel-pecan when we’re feeling it.' },
  { eyebrow: 'Coffee', body: 'Hot, iced, or with a splash. Brown sugar cream cold brew. A real affogato — espresso poured over a scoop, eaten with a spoon.' },
  { eyebrow: 'Dirty Sodas', body: 'Boylan craft soda, cream, your pick of house syrup. Built in front of you, served cold.' },
];

export default function SugarIceAbout() {
  return (
    <>
      <PageHero
        num="02"
        eyebrow="Our Story"
        title="How it started."
        lede="One trailer, one fryer, and a stubborn opinion about how mini donuts should taste."
      />

      <section className="si-about-section">
        <div className="si-row">
          <div className="si-grid-2">
            <p className="si-pull-quote">
              Make it small<span className="si-dot">.</span> Make it fresh<span className="si-dot">.</span> Make it in front of you<span className="si-dot">.</span>
            </p>
            <div>
              <p className="si-body">
                We started Sugar + Ice because the things we loved as kids &mdash; warm mini donuts at a fair, a scoop of something cold on a Saturday, kettle corn out of a paper bag &mdash; were almost always made with shortcuts. Pre-made batter. Cheap oil. The cone bigger than the scoop.
              </p>
              <p className="si-body" style={{ marginTop: 16 }}>
                We thought we could do all of that better, in one place, made to order. So we built a trailer, dialed in a recipe for brown butter sweet cream gelato, and started showing up at festivals.
              </p>
              <p className="si-body" style={{ marginTop: 16 }}>
                Now we&rsquo;re here. Same trailer some days, a counter shop other days, a hotel kiosk after that. Same five things on the menu, made the same way every time.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="si-about-section si-about-section--alt">
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">A</span>
            <span className="si-lbl">What We Make</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <h2>Five things, made the way they should be made.</h2>
            <p className="si-body">
              Short menu. Each thing on it earns its spot. We&rsquo;d rather do five things really well than twenty things in passing.
            </p>
          </div>

          <div className="si-principles" style={{ marginTop: 32 }}>
            {craft.map((c) => (
              <div key={c.eyebrow} className="si-principle">
                <span className="si-eyebrow">{c.eyebrow}</span>
                <span className="si-prose">{c.body}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="si-about-section">
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">B</span>
            <span className="si-lbl">What We Won&rsquo;t Cut</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <h2>The short list of things we&rsquo;re stubborn about.</h2>
            <p className="si-body">
              These are the line items we won&rsquo;t move on, even when it would be easier or cheaper to.
            </p>
          </div>

          <div className="si-principles" style={{ marginTop: 32 }}>
            <div className="si-principle">
              <span className="si-eyebrow">Real cream</span>
              <span className="si-prose">In the gelato, in the cold brew, in the dirty sodas. No powder, no shelf-stable shortcut.</span>
            </div>
            <div className="si-principle">
              <span className="si-eyebrow">Brown butter</span>
              <span className="si-prose">In the kettle corn and the donut glaze. Made in-house. It takes longer; it&rsquo;s worth it.</span>
            </div>
            <div className="si-principle">
              <span className="si-eyebrow">Made to order</span>
              <span className="si-prose">If it&rsquo;s sitting in a warmer, it&rsquo;s not on the menu. If you ordered it, someone is making it right now.</span>
            </div>
            <div className="si-principle">
              <span className="si-eyebrow">Boylan, not house cola</span>
              <span className="si-prose">For the dirty sodas. The good stuff costs more. The drink is better. End of argument.</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
