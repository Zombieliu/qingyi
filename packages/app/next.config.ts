import type { NextConfig } from "next";
import path from "path";
import withSerwistInit from "@serwist/next";

const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  register: false, // manual registration via RegisterPWA component
  cacheOnNavigation: true,
  reloadOnOnline: true,
});

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["contracts"],
  outputFileTracingRoot: path.resolve(process.cwd()),
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "placehold.co",
      },
    ],
  },
};

export default withSerwist(nextConfig);
