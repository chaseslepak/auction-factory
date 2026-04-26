import Link from 'next/link';
import { CrystalMark } from './CrystalMark';

const navLinks: ReadonlyArray<{ href: string; label: string }> = [
  { href: '/sugar-and-ice/about', label: 'Our Story' },
  { href: '/sugar-and-ice/visit', label: 'Book Us' },
];

export function SiteNav() {
  return (
    <nav className="si-nav">
      <div className="si-row si-nav-inner">
        <Link href="/sugar-and-ice" className="si-brand-link" aria-label="Sugar + Ice — Home">
          <span className="si-brand-mark">
            <CrystalMark size={22} ink="var(--accent)" strokeRatio={0.12} />
          </span>
          <span className="si-brand-text">
            Sugar <span className="si-brand-plus">+</span> Ice
          </span>
        </Link>
        <div className="si-nav-links">
          {navLinks.map((l) => (
            <Link key={l.href} href={l.href}>
              {l.label}
            </Link>
          ))}
          <Link href="/sugar-and-ice/visit#quote" className="si-nav-cta">
            Request a Quote
          </Link>
        </div>
      </div>
    </nav>
  );
}
