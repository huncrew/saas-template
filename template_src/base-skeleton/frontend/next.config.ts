import type { NextConfig } from "next";

const factoryBasePath = process.env.FACTORY_BASE_PATH || "";

const nextConfig: NextConfig = {
  // Template builds should be resilient in CI while the agent iterates.
  // We keep TypeScript checks, but skip ESLint failures during `next build`
  // (lint still runs in dedicated checks if you want it).
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Serverless-first: this template is meant to be deployed as static assets
  // (S3 + CloudFront) while calling API Gateway + Lambdas for backend logic.
  output: "export",
  images: { unoptimized: true },
  // Factory preview builds are published under a per-build prefix like:
  //   /p/<project_id>/<build_id>/app
  // Without a basePath, Next export will reference assets at "/_next/..." which
  // breaks when hosted under a subpath.
  ...(factoryBasePath
    ? {
        basePath: factoryBasePath,
        assetPrefix: factoryBasePath,
      }
    : {}),
};

export default nextConfig;
