import "server-only";

const SLOW_THRESHOLD_MS = 2000;

/** Wrap an API handler with timing + slow query logging */
export function withTiming<T extends (...args: unknown[]) => Promise<Response>>(
  handler: T,
  label?: string
): T {
  return (async (...args: unknown[]) => {
    const start = performance.now();
    try {
      const response = await handler(...args);
      const duration = Math.round(performance.now() - start);
      if (duration > SLOW_THRESHOLD_MS) {
        console.warn(
          JSON.stringify({
            type: "slow_api",
            path: label || "unknown",
            durationMs: duration,
            status: response.status,
            timestamp: Date.now(),
          })
        );
      }
      return response;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      console.error(
        JSON.stringify({
          type: "api_error",
          path: label || "unknown",
          durationMs: duration,
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        })
      );
      throw error;
    }
  }) as T;
}
