/// <reference lib="webworker" />
import {
  disableDevLogs,
  handlePrecaching,
  installSerwist,
  registerRuntimeCaching,
  type RuntimeCaching,
} from "@serwist/sw";
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from "@serwist/strategies";

declare const self: ServiceWorkerGlobalScope & {
  __SW_MANIFEST: Array<{
    url: string;
    revision: string | null;
  }>;
};

// Silence verbose logs in production builds
if (process.env.NODE_ENV === "production") {
  disableDevLogs();
}

const runtimeCaching: RuntimeCaching[] = [
  {
    // Always fetch API fresh to avoid stale auth/state
    matcher: ({ url }) => url.pathname.startsWith("/api/"),
    handler: new NetworkOnly(),
  },
  {
    // External API calls
    matcher: ({ url }) => url.hostname.endsWith("delta-link.app"),
    handler: new NetworkFirst({
      cacheName: "api-cache",
      networkTimeoutSeconds: 6,
      plugins: [],
    }),
  },
  {
    // Game assets, avatars, CDN static
    matcher: ({ request, url }) =>
      request.destination === "image" || url.pathname.match(/\.(png|jpg|jpeg|webp|avif|svg)$/),
    handler: new CacheFirst({
      cacheName: "images-cache",
      matchOptions: { ignoreVary: true },
    }),
  },
  {
    // Fonts and CSS
    matcher: ({ request, url }) =>
      request.destination === "style" || url.pathname.match(/\.(css|woff2?|ttf)$/),
    handler: new StaleWhileRevalidate({ cacheName: "assets-cache" }),
  },
];

const enablePrecaching = process.env.NEXT_PUBLIC_PWA_PRECACHE !== "0";
// This array is injected at build time by @serwist/next (InjectManifest)
if (enablePrecaching) {
  handlePrecaching({ precacheEntries: self.__SW_MANIFEST });
}
registerRuntimeCaching(...runtimeCaching);

installSerwist({
  cleanupOutdatedCaches: true,
  navigationPreload: true,
});
