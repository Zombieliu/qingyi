import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

describe("FetchThrottle", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    originalFetch = window.fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__QY_FETCH_THROTTLE__ = false;
  });

  afterEach(() => {
    cleanup();
    window.fetch = originalFetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__QY_FETCH_THROTTLE__ = false;
    vi.restoreAllMocks();
  });

  async function renderFreshComponent() {
    vi.resetModules();
    const mod = await import("../fetch-throttle");
    return mod.default;
  }

  it("renders null", async () => {
    const FetchThrottle = await renderFreshComponent();
    const { container } = render(<FetchThrottle />);
    expect(container.innerHTML).toBe("");
  });

  it("sets __QY_FETCH_THROTTLE__ flag on mount", async () => {
    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__QY_FETCH_THROTTLE__).toBe(true);
  });

  it("does not double-install if already active", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__QY_FETCH_THROTTLE__ = true;
    const fetchBefore = window.fetch;
    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);
    expect(window.fetch).toBe(fetchBefore);
  });

  it("passes through non-GET requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    window.fetch = mockFetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__QY_FETCH_THROTTLE__ = false;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    await window.fetch("/api/test", { method: "POST" });
    expect(mockFetch).toHaveBeenCalledWith("/api/test", { method: "POST" });
  });

  it("passes through cross-origin requests", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    await window.fetch("https://other-domain.com/api/test");
    expect(mockFetch).toHaveBeenCalledWith("https://other-domain.com/api/test", undefined);
  });

  it("passes through requests with x-qy-skip-throttle header", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    await window.fetch("/api/test", { headers: { "x-qy-skip-throttle": "1" } });
    expect(mockFetch).toHaveBeenCalledWith("/api/test", { headers: { "x-qy-skip-throttle": "1" } });
  });

  it("passes through requests with cache: no-store", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    await window.fetch("/api/test", { cache: "no-store" });
    expect(mockFetch).toHaveBeenCalledWith("/api/test", { cache: "no-store" });
  });

  it("throttles duplicate GET requests to same API path", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(new Response(`resp-${callCount}`));
    });
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    // First call goes through
    const res1 = await window.fetch("/api/test");
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res1).toBeInstanceOf(Response);

    // Second call within throttle window should return cached
    const res2 = await window.fetch("/api/test");
    // Should still be 1 call since it's within the cache TTL
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(res2).toBeInstanceOf(Response);
  });

  it("deduplicates concurrent inflight requests", async () => {
    let resolveFirst: (v: Response) => void;
    const mockFetch = vi.fn().mockImplementation(() => {
      return new Promise<Response>((resolve) => {
        resolveFirst = resolve;
      });
    });
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    // Start two concurrent requests to same URL
    const p1 = window.fetch("/api/test");
    const p2 = window.fetch("/api/test");

    // Only one actual fetch should be made
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Resolve the inflight request
    resolveFirst!(new Response("shared"));

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1).toBeInstanceOf(Response);
    expect(res2).toBeInstanceOf(Response);
  });

  it("passes through non-api paths when scope is api", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    await window.fetch("/some/page");
    expect(mockFetch).toHaveBeenCalledWith("/some/page", undefined);
  });

  it("passes through HEAD requests as GET-like but throttles them", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    const res = await window.fetch("/api/test", { method: "HEAD" });
    expect(res).toBeInstanceOf(Response);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("restores original fetch on unmount", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    const { unmount } = render(<FetchThrottle />);

    // fetch was replaced
    expect(window.fetch).not.toBe(mockFetch);

    unmount();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).__QY_FETCH_THROTTLE__).toBe(false);
  });

  it("handles Request object input for POST", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    const req = new Request(`${window.location.origin}/api/test`, { method: "POST" });
    await window.fetch(req);
    // POST should pass through
    expect(mockFetch).toHaveBeenCalledWith(req, undefined);
  });

  it("handles Request object with GET method for throttling", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    const req = new Request(`${window.location.origin}/api/data`);
    const res = await window.fetch(req);
    expect(res).toBeInstanceOf(Response);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("returns cached response within minInterval when cache exists", async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      return Promise.resolve(new Response(`resp-${callCount}`));
    });
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    // First call - populates cache
    await window.fetch("/api/test");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second call - should use cache (within TTL and minInterval)
    await window.fetch("/api/test");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Third call - still cached
    await window.fetch("/api/test");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("respects custom env var for min interval", async () => {
    const origInterval = process.env.NEXT_PUBLIC_FETCH_MIN_INTERVAL_MS;
    const origTtl = process.env.NEXT_PUBLIC_FETCH_CACHE_TTL_MS;
    process.env.NEXT_PUBLIC_FETCH_MIN_INTERVAL_MS = "100";
    process.env.NEXT_PUBLIC_FETCH_CACHE_TTL_MS = "100";

    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    await window.fetch("/api/test");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Within interval - should be cached
    await window.fetch("/api/test");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Restore
    if (origInterval === undefined) delete process.env.NEXT_PUBLIC_FETCH_MIN_INTERVAL_MS;
    else process.env.NEXT_PUBLIC_FETCH_MIN_INTERVAL_MS = origInterval;
    if (origTtl === undefined) delete process.env.NEXT_PUBLIC_FETCH_CACHE_TTL_MS;
    else process.env.NEXT_PUBLIC_FETCH_CACHE_TTL_MS = origTtl;
  });

  it("respects invalid env var for min interval (falls back to default)", async () => {
    const origInterval = process.env.NEXT_PUBLIC_FETCH_MIN_INTERVAL_MS;
    process.env.NEXT_PUBLIC_FETCH_MIN_INTERVAL_MS = "not-a-number";

    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    await window.fetch("/api/test");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Restore
    if (origInterval === undefined) delete process.env.NEXT_PUBLIC_FETCH_MIN_INTERVAL_MS;
    else process.env.NEXT_PUBLIC_FETCH_MIN_INTERVAL_MS = origInterval;
  });

  it("respects custom scope env var", async () => {
    const origScope = process.env.NEXT_PUBLIC_FETCH_THROTTLE_SCOPE;
    process.env.NEXT_PUBLIC_FETCH_THROTTLE_SCOPE = "/custom/";

    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    // /api/ path should NOT be throttled with custom scope
    await window.fetch("/api/test");
    await window.fetch("/api/test");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // /custom/ path SHOULD be throttled
    await window.fetch("/custom/data");
    await window.fetch("/custom/data");
    expect(mockFetch).toHaveBeenCalledTimes(3); // only 1 new call

    // Restore
    if (origScope === undefined) delete process.env.NEXT_PUBLIC_FETCH_THROTTLE_SCOPE;
    else process.env.NEXT_PUBLIC_FETCH_THROTTLE_SCOPE = origScope;
  });

  it("respects scope=none (no throttling)", async () => {
    const origScope = process.env.NEXT_PUBLIC_FETCH_THROTTLE_SCOPE;
    process.env.NEXT_PUBLIC_FETCH_THROTTLE_SCOPE = "none";

    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    await window.fetch("/api/test");
    await window.fetch("/api/test");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Restore
    if (origScope === undefined) delete process.env.NEXT_PUBLIC_FETCH_THROTTLE_SCOPE;
    else process.env.NEXT_PUBLIC_FETCH_THROTTLE_SCOPE = origScope;
  });

  it("respects scope=all (throttle everything)", async () => {
    const origScope = process.env.NEXT_PUBLIC_FETCH_THROTTLE_SCOPE;
    process.env.NEXT_PUBLIC_FETCH_THROTTLE_SCOPE = "all";

    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    await window.fetch("/some/page");
    await window.fetch("/some/page");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Restore
    if (origScope === undefined) delete process.env.NEXT_PUBLIC_FETCH_THROTTLE_SCOPE;
    else process.env.NEXT_PUBLIC_FETCH_THROTTLE_SCOPE = origScope;
  });

  it("respects exclude env var", async () => {
    const origExclude = process.env.NEXT_PUBLIC_FETCH_THROTTLE_EXCLUDE;
    process.env.NEXT_PUBLIC_FETCH_THROTTLE_EXCLUDE = "/api/health,/api/auth";

    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    // Excluded path should not be throttled
    await window.fetch("/api/health");
    await window.fetch("/api/health");
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Non-excluded path should be throttled
    await window.fetch("/api/data");
    await window.fetch("/api/data");
    expect(mockFetch).toHaveBeenCalledTimes(3); // only 1 new call

    // Restore
    if (origExclude === undefined) delete process.env.NEXT_PUBLIC_FETCH_THROTTLE_EXCLUDE;
    else process.env.NEXT_PUBLIC_FETCH_THROTTLE_EXCLUDE = origExclude;
  });

  it("uses minInterval cache when TTL expired but interval not", async () => {
    // Set short TTL but longer interval
    const origTtl = process.env.NEXT_PUBLIC_FETCH_CACHE_TTL_MS;
    const origInterval = process.env.NEXT_PUBLIC_FETCH_MIN_INTERVAL_MS;
    process.env.NEXT_PUBLIC_FETCH_CACHE_TTL_MS = "1"; // 1ms TTL
    process.env.NEXT_PUBLIC_FETCH_MIN_INTERVAL_MS = "60000"; // 60s interval

    const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
    window.fetch = mockFetch;

    const FetchThrottle = await renderFreshComponent();
    render(<FetchThrottle />);

    // First call - populates cache
    await window.fetch("/api/test");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Wait for TTL to expire (1ms)
    await new Promise((r) => setTimeout(r, 10));

    // Second call - TTL expired but minInterval not expired, should use cached
    await window.fetch("/api/test");
    expect(mockFetch).toHaveBeenCalledTimes(1); // still cached via minInterval

    // Restore
    if (origTtl === undefined) delete process.env.NEXT_PUBLIC_FETCH_CACHE_TTL_MS;
    else process.env.NEXT_PUBLIC_FETCH_CACHE_TTL_MS = origTtl;
    if (origInterval === undefined) delete process.env.NEXT_PUBLIC_FETCH_MIN_INTERVAL_MS;
    else process.env.NEXT_PUBLIC_FETCH_MIN_INTERVAL_MS = origInterval;
  });
});
