import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const SITE_URL = 'https://chaseslepak.com';

const POSITIONING =
  'Operator + builder in Cleveland, OH. Co-Founder at Pretty Tasty, COO at Boylan Bottling, President at RainShadow Labs. Advisor + investor. Founder of Reagan Brooks — our portfolio of small businesses, named after our kids, with interests across real estate, foodservice, athletic training, family entertainment, home services support, commercial equipment repossession, auction liquidation and resale, and whatever else we find interesting.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'Chase Slepak — Operator + Builder | Cleveland, OH',
  description: POSITIONING,
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'profile',
    url: SITE_URL,
    title: 'Chase Slepak — Operator + Builder | Cleveland, OH',
    description: POSITIONING,
    siteName: 'Chase Slepak',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Chase Slepak — Operator + Builder | Cleveland, OH',
    description: POSITIONING,
    creator: '@chaseslepak',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F5F2EC',
};

const personSchema = {
  '@context': 'https://schema.org',
  '@type': 'Person',
  name: 'Chase Slepak',
  jobTitle: 'Operator + Builder',
  description: POSITIONING,
  url: SITE_URL,
  address: {
    '@type': 'PostalAddress',
    addressLocality: 'Cleveland',
    addressRegion: 'OH',
    addressCountry: 'US',
  },
  email: 'mailto:chase.slepak@gmail.com',
  sameAs: [
    'https://www.linkedin.com/in/chaseslepak',
    'https://www.instagram.com/chaseslepak',
    'https://x.com/chaseslepak',
  ],
  worksFor: [
    { '@type': 'Organization', name: 'Pretty Tasty' },
    { '@type': 'Organization', name: 'Boylan Bottling' },
    { '@type': 'Organization', name: 'RainShadow Labs' },
    { '@type': 'Organization', name: 'Reagan Brooks' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const plausibleDomain = process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN;
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
        />
      </head>
      <body className="font-sans bg-cream text-ink antialiased">
        {children}
        {plausibleDomain ? (
          <Script
            strategy="afterInteractive"
            defer
            data-domain={plausibleDomain}
            src="https://plausible.io/js/script.outbound-links.js"
          />
        ) : null}
      </body>
    </html>
  );
}
