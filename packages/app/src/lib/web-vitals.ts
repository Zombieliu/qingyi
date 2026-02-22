"use client";

type WebVitalMetric = {
  name: string;
  value: number;
  rating: "good" | "needs-improvement" | "poor";
  id: string;
  delta: number;
};

const VITALS_ENDPOINT = "/api/vitals";

/** Report Web Vitals to analytics endpoint */
export function reportWebVitals(metric: WebVitalMetric) {
  // Read env directly to avoid importing server-only feature-flags
  if (process.env.NEXT_PUBLIC_FF_WEB_VITALS === "0") return;

  const body = {
    name: metric.name,
    value: Math.round(metric.name === "CLS" ? metric.value * 1000 : metric.value),
    rating: metric.rating,
    id: metric.id,
    page: typeof window !== "undefined" ? window.location.pathname : "",
    timestamp: Date.now(),
  };

  // Use sendBeacon for reliability, fallback to fetch
  if (typeof navigator !== "undefined" && navigator.sendBeacon) {
    navigator.sendBeacon(VITALS_ENDPOINT, JSON.stringify(body));
  } else {
    fetch(VITALS_ENDPOINT, {
      method: "POST",
      body: JSON.stringify(body),
      keepalive: true,
      headers: { "Content-Type": "application/json" },
    }).catch(() => {});
  }
}

/** Slow query alert threshold (ms) */
export const SLOW_QUERY_THRESHOLD_MS = 2000;

/** Log slow API response for monitoring */
export function reportSlowQuery(path: string, durationMs: number, extra?: Record<string, unknown>) {
  if (durationMs < SLOW_QUERY_THRESHOLD_MS) return;
  console.warn(`[SLOW_QUERY] ${path} took ${durationMs}ms`, extra);

  // Report to Sentry if available
  if (typeof window !== "undefined") {
    import("@sentry/nextjs")
      .then((Sentry) => {
        Sentry.captureMessage(`Slow query: ${path} (${durationMs}ms)`, {
          level: "warning",
          extra: { path, durationMs, ...extra },
        });
      })
      .catch(() => {});
  }
}
