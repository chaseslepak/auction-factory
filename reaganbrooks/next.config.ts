import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static HTML export — produces a flat `out/` folder of HTML, CSS,
  // JS, fonts, and images that can be hosted on any static host
  // (Cloudflare Pages, S3, Netlify, GitHub Pages, etc.) without a
  // Node runtime.
  output: "export",

  // Optional but matches the directory name we expect to drag-and-drop.
  distDir: ".next",

  // Static export requires unoptimized images (the next/image optimizer
  // needs a Node runtime). The site has no images, so this is a no-op
  // safeguard for future use.
  images: {
    unoptimized: true,
  },

  // Confine Turbopack to this directory. Without this, Next walks up
  // and treats the surrounding `auction-factory/` as the project root,
  // which pulls in unrelated middleware and config.
  turbopack: {
    root: import.meta.dirname,
  },
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
