import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import AfKeepAlive from '@/components/AfKeepAlive';
import GlobalJobPoller from '@/components/GlobalJobPoller';
import './globals.css';

const inter = localFont({
  src: [
    {
      path: '../fonts/inter-latin.woff2',
      style: 'normal',
    },
  ],
  variable: '--font-inter',
  display: 'swap',
  fallback: [
    'ui-sans-serif',
    'system-ui',
    '-apple-system',
    'BlinkMacSystemFont',
    'Segoe UI',
    'Roboto',
    'Helvetica Neue',
    'Arial',
    'sans-serif',
  ],
});

export const metadata: Metadata = {
  title: 'Ohio Lotter | Auction Factory',
  description: 'Photograph restaurant equipment and generate auction listings',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Ohio Lotter',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0A1628',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans bg-brand-bg min-h-screen`}>
        {children}
        <AfKeepAlive />
        <GlobalJobPoller />
        <script
          dangerouslySetInnerHTML={{
            __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js')}`,
          }}
        />
      </body>
    </html>
  );
}
