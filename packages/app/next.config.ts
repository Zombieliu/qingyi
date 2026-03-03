import type { NextConfig } from "next";
import path from "path";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";
import withBundleAnalyzer from "@next/bundle-analyzer";

const analyzeBuild = withBundleAnalyzer({ enabled: process.env.ANALYZE === "1" });

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.PWA_BUILD !== "1",
  register: false, // manual registration via RegisterPWA component
  cacheOnNavigation: true,
  reloadOnOnline: true,
});

const repoRoot = path.resolve(__dirname, "../..");
const isOpenNextBuild = process.env.OPEN_NEXT_BUILD === "1";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: process.env.DOCKER_BUILD === "1" || isOpenNextBuild ? "standalone" : undefined,
  transpilePackages: ["contracts"],
  outputFileTracingRoot: isOpenNextBuild ? undefined : repoRoot,
  turbopack: {
    root: repoRoot,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  outputFileTracingIncludes: isOpenNextBuild
    ? undefined
    : {
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
  webpack: (config) => {
    if (!isOpenNextBuild) return config;
    config.resolve ??= {};
    config.resolve.alias ??= {};
    config.resolve.alias["@sentry/nextjs"] = path.resolve(
      __dirname,
      "src/lib/shims/sentry-nextjs.ts"
    );
    return config;
  },
};

const pwaConfig = process.env.PWA_BUILD === "1" ? withSerwist(nextConfig) : nextConfig;
const analyzed = analyzeBuild(pwaConfig);

const sentryConfig = {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  hideSourceMaps: true,
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
};

export default isOpenNextBuild ? analyzed : withSentryConfig(analyzed, sentryConfig);

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
