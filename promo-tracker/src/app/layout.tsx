import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Promo Tracker",
  description: "Promotional activity tracking for Boylan Bottling and Pretty Tasty."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
