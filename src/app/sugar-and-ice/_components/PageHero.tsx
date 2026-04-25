type PageHeroProps = {
  num: string;
  eyebrow: string;
  title: string;
  lede?: string;
};

export function PageHero({ num, eyebrow, title, lede }: PageHeroProps) {
  return (
    <header className="si-page-hero">
      <div className="si-row">
        <div className="si-section-label si-section-label--on-dark">
          <span className="si-num">{num}</span>
          <span className="si-lbl">{eyebrow}</span>
          <span className="si-line" />
        </div>
        <h1 className="si-page-hero-title">{title}</h1>
        {lede && <p className="si-page-hero-lede">{lede}</p>}
      </div>
    </header>
  );
}
