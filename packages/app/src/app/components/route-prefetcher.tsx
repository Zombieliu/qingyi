"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Prefetch key routes on idle to improve navigation speed.
 * Uses requestIdleCallback to avoid blocking the main thread.
 */
const PREFETCH_ROUTES = ["/", "/me", "/me/orders", "/faq", "/pricing"];

export function RoutePrefetcher() {
  const router = useRouter();

  useEffect(() => {
    const prefetch = () => {
      for (const route of PREFETCH_ROUTES) {
        router.prefetch(route);
      }
    };

    if ("requestIdleCallback" in window) {
      const id = requestIdleCallback(prefetch, { timeout: 5000 });
      return () => cancelIdleCallback(id);
    } else {
      const timer = setTimeout(prefetch, 3000);
      return () => clearTimeout(timer);
    }
  }, [router]);

  return null;
}
