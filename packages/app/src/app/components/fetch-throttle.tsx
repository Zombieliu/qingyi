"use client";

import { useEffect } from "react";

type CacheEntry = {
  response: Response;
  updatedAt: number;
};

const DEFAULT_MIN_INTERVAL_MS = 2000;
const DEFAULT_CACHE_TTL_MS = 2000;
const DEFAULT_THROTTLE_SCOPE = "api";

function getNumber(value: string | undefined, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export default function FetchThrottle() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const win = window as Window & { __QY_FETCH_THROTTLE__?: boolean };
    if (win.__QY_FETCH_THROTTLE__) return;
    win.__QY_FETCH_THROTTLE__ = true;

    const originalFetch = window.fetch.bind(window);
    const inflight = new Map<string, Promise<Response>>();
    const cache = new Map<string, CacheEntry>();
    const lastCalled = new Map<string, number>();

    const minIntervalMs = getNumber(
      process.env.NEXT_PUBLIC_FETCH_MIN_INTERVAL_MS,
      DEFAULT_MIN_INTERVAL_MS
    );
    const cacheTtlMs = getNumber(process.env.NEXT_PUBLIC_FETCH_CACHE_TTL_MS, DEFAULT_CACHE_TTL_MS);
    const scope = (
      process.env.NEXT_PUBLIC_FETCH_THROTTLE_SCOPE || DEFAULT_THROTTLE_SCOPE
    ).toLowerCase();
    const exclude = (process.env.NEXT_PUBLIC_FETCH_THROTTLE_EXCLUDE || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const shouldThrottlePath = (pathname: string) => {
      if (scope === "none") return false;
      if (scope === "all") return true;
      if (scope === "api") return pathname.startsWith("/api/");
      return pathname.startsWith(scope);
    };

    const isExcluded = (pathname: string) =>
      exclude.some((item) => pathname === item || pathname.startsWith(`${item}/`));

    const shouldSkip = (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(
        init?.headers || (input instanceof Request ? input.headers : undefined)
      );
      if (headers.get("x-qy-skip-throttle") === "1") return true;
      if ((init?.cache || (input instanceof Request ? input.cache : "")) === "no-store")
        return true;
      return false;
    };

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (
        init?.method || (input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        return originalFetch(input, init);
      }
      if (shouldSkip(input, init)) {
        return originalFetch(input, init);
      }
      const url = input instanceof Request ? input.url : String(input);
      const resolved = new URL(url, window.location.origin);
      if (resolved.origin !== window.location.origin) {
        return originalFetch(input, init);
      }
      if (!shouldThrottlePath(resolved.pathname) || isExcluded(resolved.pathname)) {
        return originalFetch(input, init);
      }
      const key = `${method}:${resolved.pathname}${resolved.search}`;
      const now = Date.now();

      const cached = cache.get(key);
      if (cached && now - cached.updatedAt <= cacheTtlMs) {
        return cached.response.clone();
      }
      const last = lastCalled.get(key) || 0;
      if (minIntervalMs > 0 && now - last < minIntervalMs && cached) {
        return cached.response.clone();
      }
      if (inflight.has(key)) {
        const res = await inflight.get(key)!;
        return res.clone();
      }

      lastCalled.set(key, now);
      const task = originalFetch(input, init).then((res) => {
        cache.set(key, { response: res.clone(), updatedAt: Date.now() });
        return res;
      });
      inflight.set(key, task);
      try {
        return await task;
      } finally {
        inflight.delete(key);
      }
    };

    return () => {
      window.fetch = originalFetch;
      win.__QY_FETCH_THROTTLE__ = false;
    };
  }, []);

  return null;
}
