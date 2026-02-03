import type { NextConfig } from "next";
import path from "path";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.PWA_BUILD !== "1",
  register: false, // manual registration via RegisterPWA component
  cacheOnNavigation: true,
  reloadOnOnline: true,
});

const repoRoot = path.resolve(__dirname, "../..");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["contracts"],
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
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

export default process.env.PWA_BUILD === "1" ? withSerwist(nextConfig) : nextConfig;
