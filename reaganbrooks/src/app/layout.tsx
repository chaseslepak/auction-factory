import type { Metadata, Viewport } from "next";
import { EB_Garamond } from "next/font/google";

import "@/styles/tokens.css";
import "./globals.css";

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-eb-garamond",
  fallback: ["Georgia", "serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://reaganbrooks.com"),
  title: {
    default: "Reagan Brooks",
    template: "%s — Reagan Brooks",
  },
  description:
    "A privately held holding company headquartered in Northeast Ohio.",
  openGraph: {
    title: "Reagan Brooks",
    description:
      "A privately held holding company headquartered in Northeast Ohio.",
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
