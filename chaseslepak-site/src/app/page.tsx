import type { ReactNode } from 'react';

const POSITIONING =
  'Operator + builder in Cleveland, OH. Co-Founder at Pretty Tasty, COO at Boylan Bottling, President at RainShadow Labs. Advisor + investor. Founder of Reagan Brooks — our portfolio of small businesses, named after our kids, with interests across real estate, foodservice, athletic training, family entertainment, home services support, commercial equipment repossession, auction liquidation and resale, and whatever else we find interesting.';

const VENTURES: Array<{
  name: string;
  description: string;
  href: string | null;
  comingSoon?: boolean;
}> = [
  {
    name: 'Crazy Good Co',
    description: 'Restaurant equipment, direct sales and auction.',
    href: 'https://crazygoodbuy.com',
  },
  {
    name: 'Auction Factory CLE',
    description: 'Six-state auction territory (OH, PA, WV, KY, MI, IN).',
    href: 'https://auctionfactory.com',
  },
  {
    name: 'Home Hub Collective',
    description: 'Back-office for owner-operated home services companies.',
    href: 'https://homehubcollective.com',
  },
  {
    name: 'Slepak Enterprises',
    description: 'Real estate and short-term rentals.',
    href: 'https://slepakenterprises.com',
  },
  {
    name: 'Superior Being / SwingZone',
    description: 'Indoor athletic training facility.',
    href: 'https://swingzonesportshub.com',
  },
  {
    name: "Uncle Joe's Good Time",
    description: 'Family entertainment + convenience.',
    href: 'https://unclejoesgoodtime.com',
  },
  {
    name: 'Sugar + Ice',
    description:
      'Foodservice concept. Coffee, desserts, ice cream, dirty sodas, donuts.',
    href: null,
    comingSoon: true,
  },
  {
    name: 'Purvey CPG',
    description: 'Advisory and investment in emerging CPG brands.',
    href: 'https://purveycpg.com',
  },
];

function ExternalLink({
  href,
  children,
  className = '',
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`underline-offset-4 hover:underline hover:text-oxblood transition-colors ${className}`}
    >
      {children}
    </a>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.7rem] uppercase tracking-[0.22em] text-oxblood font-medium">
      {children}
    </p>
  );
}

export default function HomePage() {
  const year = new Date().getFullYear();

  return (
    <main className="mx-auto w-full max-w-column px-6 sm:px-8">
      {/* HERO */}
      <section className="pt-16 pb-20 sm:pt-24 sm:pb-28">
        <div className="mb-10 sm:mb-12">
          {/* Headshot placeholder — swap for next/image when Chase provides */}
          <div
            aria-label="Portrait of Chase Slepak (placeholder)"
            role="img"
            className="w-32 h-40 sm:w-36 sm:h-44 bg-[#E6DECF] border border-hairline flex items-center justify-center text-muted text-[0.65rem] uppercase tracking-[0.2em]"
          >
            Headshot
          </div>
        </div>

        <h1 className="font-display font-black text-[3rem] sm:text-[4.25rem] leading-[1.02] tracking-[-0.01em] text-ink">
          Chase Slepak
        </h1>

        <p className="mt-8 sm:mt-10 text-[1.0625rem] sm:text-[1.125rem] leading-[1.65] text-ink">
          {POSITIONING}
        </p>

        <div className="mt-10 flex flex-wrap items-center gap-x-8 gap-y-3 text-[0.95rem]">
          <ExternalLink
            href="https://www.linkedin.com/in/chaseslepak"
            className="font-medium"
          >
            LinkedIn <span aria-hidden="true">↗</span>
          </ExternalLink>
          <a
            href="mailto:chase.slepak@gmail.com"
            className="font-medium underline-offset-4 hover:underline hover:text-oxblood transition-colors"
          >
            Email <span aria-hidden="true">↗</span>
          </a>
        </div>
      </section>

      {/* WHAT I DO */}
      <section className="py-16 sm:py-20 border-t border-hairline">
        <SectionLabel>What I Do</SectionLabel>

        <div className="mt-10 sm:mt-12 space-y-12 sm:space-y-14">
          <article>
            <h3 className="font-display text-2xl sm:text-[1.75rem] leading-tight text-ink">
              W2 Operating Roles
            </h3>
            <p className="mt-4 text-[1.0625rem] leading-[1.65] text-ink">
              I run operating roles in CPG and beverage. Co-Founder at{' '}
              <ExternalLink href="https://prettytasty.com">
                Pretty Tasty
              </ExternalLink>
              . COO at{' '}
              <ExternalLink href="https://boylanbottling.com">
                Boylan Bottling
              </ExternalLink>
              . President at{' '}
              <ExternalLink href="https://rainshadowlabs.com">
                RainShadow Labs
              </ExternalLink>
              .
            </p>
          </article>

          <article>
            <h3 className="font-display text-2xl sm:text-[1.75rem] leading-tight text-ink">
              Advisor + Investor
            </h3>
            <p className="mt-4 text-[1.0625rem] leading-[1.65] text-ink">
              I advise and invest in emerging brands. CPG, marketplaces,
              services, anything with distribution leverage and an honest
              operator behind it.
            </p>
          </article>

          <article>
            <h3 className="font-display text-2xl sm:text-[1.75rem] leading-tight text-ink">
              Reagan Brooks
            </h3>
            <p className="mt-4 text-[1.0625rem] leading-[1.65] text-ink">
              <ExternalLink href="#">Reagan Brooks</ExternalLink> is our
              portfolio of small businesses — named after our kids — with
              interests across real estate, foodservice, athletic training,
              family entertainment, home services support, commercial equipment
              repossession, auction liquidation and resale, and whatever else
              we find interesting.
            </p>
          </article>
        </div>
      </section>

      {/* PORTFOLIO */}
      <section className="py-16 sm:py-20 border-t border-hairline">
        <SectionLabel>Portfolio</SectionLabel>

        <div className="mt-10 sm:mt-12 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-10 sm:gap-y-12">
          {VENTURES.map((v) => (
            <article
              key={v.name}
              className="pt-6 border-t border-hairline first:border-t sm:[&:nth-child(-n+2)]:border-t"
            >
              {v.href ? (
                <a
                  href={v.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block"
                >
                  <h3 className="font-display text-xl leading-tight text-ink group-hover:text-oxblood transition-colors">
                    {v.name}{' '}
                    <span
                      aria-hidden="true"
                      className="text-muted group-hover:text-oxblood"
                    >
                      ↗
                    </span>
                  </h3>
                  <p className="mt-2 text-[0.975rem] leading-[1.6] text-muted">
                    {v.description}
                  </p>
                </a>
              ) : (
                <div>
                  <h3 className="font-display text-xl leading-tight text-ink">
                    {v.name}
                  </h3>
                  <p className="mt-2 text-[0.975rem] leading-[1.6] text-muted">
                    {v.description}
                    {v.comingSoon ? (
                      <>
                        {' '}
                        <span className="text-oxblood">Coming soon.</span>
                      </>
                    ) : null}
                  </p>
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* ABOUT */}
      <section className="py-16 sm:py-20 border-t border-hairline">
        <SectionLabel>About</SectionLabel>

        <div className="mt-10 sm:mt-12 space-y-6 text-[1.0625rem] leading-[1.7] text-ink">
          <p>
            I was born into the beverage industry. Spent my career across CPG
            sales and distribution, private label manufacturing, brand
            strategy, liquidation, and platforms. Most of it in Cleveland.
          </p>
          <p>
            I operate with bias to action and commercial pragmatism. Take the
            biggest bite you can, then figure out how to chew it. Don&rsquo;t
            use five-dollar words to say ten-cent sentences. Plow horse.
          </p>
          <p className="text-muted">
            Husband to Kate. Dad to Reagan and Charlie. Sunday Supper is
            sacred.
          </p>
        </div>
      </section>

      {/* CONNECT */}
      <section className="py-16 sm:py-20 border-t border-hairline">
        <SectionLabel>Connect</SectionLabel>

        <ul className="mt-10 sm:mt-12 space-y-4 text-[1.0625rem]">
          <li>
            <a
              href="mailto:chase.slepak@gmail.com"
              className="hover:text-oxblood underline-offset-4 hover:underline transition-colors"
            >
              chase.slepak@gmail.com
            </a>
          </li>
          <li>
            <ExternalLink href="https://www.linkedin.com/in/chaseslepak">
              linkedin.com/in/chaseslepak
            </ExternalLink>
          </li>
          <li>
            <ExternalLink href="https://www.instagram.com/chaseslepak">
              instagram.com/chaseslepak
            </ExternalLink>
          </li>
          <li>
            <ExternalLink href="https://x.com/chaseslepak">
              x.com/chaseslepak
            </ExternalLink>
          </li>
        </ul>
      </section>

      {/* FOOTER */}
      <footer className="py-12 sm:py-16 border-t border-hairline text-[0.8rem] text-muted flex flex-wrap gap-x-6 gap-y-2 justify-between">
        <span>&copy; {year} Chase Slepak</span>
        <span>Built in Cleveland.</span>
      </footer>
    </main>
  );
}
