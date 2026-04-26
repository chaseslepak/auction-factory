import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Confine Turbopack to this directory. Without this, Next 16 walks up
  // and treats the surrounding `auction-factory/` as the project root,
  // which pulls in unrelated middleware and config.
  turbopack: {
    root: import.meta.dirname,
  },
  // Same for the file-tracing pass (serverless/standalone bundling).
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
