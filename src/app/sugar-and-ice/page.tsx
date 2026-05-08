import { CrystalMark } from './_components/CrystalMark';

export default function SugarIceHome() {
  return (
    <>
      <header className="si-hero" id="top">
        <div className="si-row">
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
            <span className="si-tag-quiet">Donuts · Gelato · Kettle Corn</span>
            <span className="si-tag-quiet">Coffee · Dirty Sodas</span>
          </div>

          <div className="si-hero-grid">
            <p className="si-hero-lede">
              Donuts fried to order. Hand-scooped gelato, kettle corn out of the kettle, craft coffee, and Boylan dirty sodas &mdash; every one of them made on-site, with intentional, gourmet flavors. For weddings, festivals, parties, and corporate days.
            </p>
          </div>

          <div className="si-cta-row">
            <a href="#contact" className="si-btn si-btn-accent">
              Get in Touch <span className="si-arrow">→</span>
            </a>
            <a href="#about" className="si-btn si-btn-ghost">
              About Us
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

      <section className="si-section" id="about">
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">A</span>
            <span className="si-lbl">About Us</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <p className="si-pull-quote">
              Five categories<span className="si-dot">.</span> A chef-driven menu<span className="si-dot">.</span> Always changing<span className="si-dot">.</span>
            </p>
            <div>
              <p className="si-body">
                Sugar + Ice is a chef-driven dessert trailer that does five things &mdash; donuts, gelato, kettle corn, craft coffee, and Boylan dirty sodas &mdash; and does each of them at a level you don&rsquo;t usually associate with anything served out of a window.
              </p>
              <p className="si-body" style={{ marginTop: 16 }}>
                The menu changes. Flavors rotate with the season, the event, and what&rsquo;s good that week. What stays the same is the standard: real ingredients, real technique, every order made the moment you place it. Nothing sits. Nothing comes out of a bottle.
              </p>
              <p className="si-body" style={{ marginTop: 16 }}>
                We book the trailer for weddings, fairs, parties, and corporate days &mdash; same five categories, a chef-built menu every time, made on-site at your event.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="si-section" style={{ background: 'var(--cream-2)' }} id="contact">
        <div className="si-row">
          <div className="si-section-label">
            <span className="si-num">B</span>
            <span className="si-lbl">Get in Touch</span>
            <span className="si-line" />
          </div>

          <div className="si-grid-2">
            <h2>Tell us about your event.</h2>
            <p className="si-body">
              Drop us a line and we&rsquo;ll write back within a day or two. The more you tell us up front &mdash; date, headcount, location &mdash; the tighter we can quote it.
            </p>
          </div>

          <form className="si-quote-form" action="mailto:hello@thesugarandice.com" method="post" encType="text/plain">
            <div className="si-form-grid">
              <label>
                <span>Your name</span>
                <input type="text" name="name" required />
              </label>
              <label>
                <span>Email</span>
                <input type="email" name="email" required />
              </label>
              <label className="si-form-wide">
                <span>Phone (optional)</span>
                <input type="tel" name="phone" />
              </label>
              <label className="si-form-wide">
                <span>Message</span>
                <textarea name="message" rows={6} placeholder="Tell us about your event — date, headcount, location, what kind of day it is." required />
              </label>
            </div>
            <button type="submit">
              Send the Message <span aria-hidden>→</span>
            </button>
          </form>

          <p className="si-body" style={{ marginTop: 32, opacity: 0.7 }}>
            Or reach us directly at{' '}
            <a href="mailto:hello@thesugarandice.com" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
              hello@thesugarandice.com
            </a>
            .
          </p>
        </div>
      </section>
    </>
  );
}
