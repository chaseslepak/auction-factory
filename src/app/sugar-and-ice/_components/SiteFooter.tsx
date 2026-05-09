import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="si-footer">
      <div className="si-row">
        <div className="si-footer-grid">
          <div>
            <p className="si-footer-tagline">
              Fried<span className="si-dot">.</span> Scooped<span className="si-dot">.</span> Popped<span className="si-dot">.</span> Poured<span className="si-dot">.</span>
            </p>
            <a href="https://thesugarandice.com" className="si-footer-domain">
              thesugarandice<span className="si-tld">.com</span>
            </a>
          </div>
          <div>
            <h4>Explore</h4>
            <p><Link href="/sugar-and-ice#about">About</Link></p>
            <p><Link href="/sugar-and-ice#contact">Get in Touch</Link></p>
          </div>
          <div>
            <h4>Reach Us</h4>
            <p><a href="mailto:chase@thesugarandice.com">chase@thesugarandice.com</a></p>
          </div>
        </div>

        <div className="si-footer-bottom">
          <span>Sugar <span style={{ color: 'var(--accent)' }}>+</span> Ice &nbsp;·&nbsp; &copy; {new Date().getFullYear()}</span>
          <span>Made Small · Made Fresh · Made to Order</span>
        </div>
      </div>
    </footer>
  );
}
