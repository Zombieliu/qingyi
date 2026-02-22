import type { NextConfig } from "next";
import path from "path";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.PWA_BUILD !== "1",
  register: false, // manual registration via RegisterPWA component
  cacheOnNavigation: true,
  reloadOnOnline: true,
});

const repoRoot = path.resolve(__dirname, "../..");

const isVercel = process.env.VERCEL === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["contracts"],
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
  },
  typescript: {
    ignoreBuildErrors: isVercel,
  },
  outputFileTracingIncludes: {
    "/**/*": ["node_modules/next/dist/compiled/source-map/**"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },
};

const pwaConfig = process.env.PWA_BUILD === "1" ? withSerwist(nextConfig) : nextConfig;

export default withSentryConfig(
  pwaConfig,
  {
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    authToken: process.env.SENTRY_AUTH_TOKEN,
    hideSourceMaps: true,
  }
);
