import type { Metadata, Viewport } from "next";
import { EB_Garamond } from "next/font/google";

import "@/styles/tokens.css";
import "./globals.css";

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-eb-garamond",
  fallback: ["EB Garamond", "Hoefler Text", "Garamond", "Georgia", "serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://reaganbrooks.com"),
  title: {
    default: "Reagan Brooks",
    template: "%s — Reagan Brooks",
  },
  description: "A privately held holding company.",
  manifest: "/manifest.json",
  openGraph: {
    title: "Reagan Brooks",
    description: "A privately held holding company.",
    url: "/",
    siteName: "Reagan Brooks",
    type: "website",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#F5F1E8",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={ebGaramond.variable}>
      <body>{children}</body>
    </html>
  );
}
