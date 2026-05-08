import Link from 'next/link';
import { CrystalMark } from './CrystalMark';

export function SiteNav() {
  return (
    <nav className="si-nav">
      <div className="si-row si-nav-inner">
        <Link href="/sugar-and-ice#top" className="si-brand-link" aria-label="Sugar + Ice — Home">
          <span className="si-brand-mark">
            <CrystalMark size={22} ink="var(--accent)" strokeRatio={0.12} />
          </span>
          <span className="si-brand-text">
            Sugar <span className="si-brand-plus">+</span> Ice
          </span>
        </Link>
        <div className="si-nav-links">
          <Link href="/sugar-and-ice#about">About</Link>
          <Link href="/sugar-and-ice#contact" className="si-nav-cta">
            Get in Touch
          </Link>
        </div>
      </div>
    </nav>
  );
}
