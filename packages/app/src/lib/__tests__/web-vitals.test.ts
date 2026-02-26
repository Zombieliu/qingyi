import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockCaptureMessage = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
}));

import { reportWebVitals, reportSlowQuery, SLOW_QUERY_THRESHOLD_MS } from "../web-vitals";

describe("web-vitals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("reportWebVitals", () => {
    it("sends metric via sendBeacon when available", () => {
      const mockSendBeacon = vi.fn(() => true);
      Object.defineProperty(navigator, "sendBeacon", {
        value: mockSendBeacon,
        writable: true,
        configurable: true,
      });

      reportWebVitals({
        name: "LCP",
        value: 2500,
        rating: "good",
        id: "v1-123",
        delta: 100,
      });

      expect(mockSendBeacon).toHaveBeenCalledWith("/api/vitals", expect.any(String));

      const body = JSON.parse((mockSendBeacon.mock.calls[0] as unknown[])[1] as string);
      expect(body.name).toBe("LCP");
      expect(body.value).toBe(2500);
      expect(body.rating).toBe("good");
    });

    it("rounds CLS value by multiplying by 1000", () => {
      const mockSendBeacon = vi.fn(() => true);
      Object.defineProperty(navigator, "sendBeacon", {
        value: mockSendBeacon,
        writable: true,
        configurable: true,
      });

      reportWebVitals({
        name: "CLS",
        value: 0.123,
        rating: "good",
        id: "v1-cls",
        delta: 0.01,
      });

      const body = JSON.parse((mockSendBeacon.mock.calls[0] as unknown[])[1] as string);
      expect(body.value).toBe(123);
    });

    it("does nothing when FF_WEB_VITALS is 0", () => {
      const original = process.env.NEXT_PUBLIC_FF_WEB_VITALS;
      process.env.NEXT_PUBLIC_FF_WEB_VITALS = "0";

      const mockSendBeacon = vi.fn();
      Object.defineProperty(navigator, "sendBeacon", {
        value: mockSendBeacon,
        writable: true,
        configurable: true,
      });

      reportWebVitals({
        name: "LCP",
        value: 2500,
        rating: "good",
        id: "v1-123",
        delta: 100,
      });

      expect(mockSendBeacon).not.toHaveBeenCalled();
      process.env.NEXT_PUBLIC_FF_WEB_VITALS = original;
    });

    it("falls back to fetch when sendBeacon is not available", async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response("ok"));
      global.fetch = mockFetch;
      Object.defineProperty(navigator, "sendBeacon", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      reportWebVitals({
        name: "FCP",
        value: 1000,
        rating: "good",
        id: "v1-fcp",
        delta: 50,
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "/api/vitals",
        expect.objectContaining({
          method: "POST",
          keepalive: true,
        })
      );
    });

    it("handles fetch rejection gracefully", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("network error"));
      global.fetch = mockFetch;
      Object.defineProperty(navigator, "sendBeacon", {
        value: undefined,
        writable: true,
        configurable: true,
      });

      // Should not throw
      reportWebVitals({
        name: "FCP",
        value: 1000,
        rating: "good",
        id: "v1-fcp-err",
        delta: 50,
      });

      // Wait for the catch to execute
      await new Promise((r) => setTimeout(r, 50));
    });
  });

  describe("reportSlowQuery", () => {
    it("does nothing below threshold", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      reportSlowQuery("/api/test", 100);
      expect(spy).not.toHaveBeenCalled();
    });

    it("logs warning at or above threshold", async () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      reportSlowQuery("/api/test", SLOW_QUERY_THRESHOLD_MS + 1);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("[SLOW_QUERY]"), undefined);
      // Wait for async Sentry import to settle
      await new Promise((r) => setTimeout(r, 50));
    });

    it("SLOW_QUERY_THRESHOLD_MS is 2000", () => {
      expect(SLOW_QUERY_THRESHOLD_MS).toBe(2000);
    });

    it("passes extra data to console.warn", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const extra = { query: "SELECT *" };
      reportSlowQuery("/api/test", SLOW_QUERY_THRESHOLD_MS + 1, extra);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("[SLOW_QUERY]"), extra);
    });

    it("reports to Sentry when window is defined and above threshold", async () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockCaptureMessage.mockClear();
      reportSlowQuery("/api/slow", 3000, { detail: "test" });
      expect(spy).toHaveBeenCalled();
      // Sentry import is async, wait for it to resolve
      await new Promise((r) => setTimeout(r, 50));
      expect(mockCaptureMessage).toHaveBeenCalledWith(
        expect.stringContaining("Slow query: /api/slow"),
        expect.objectContaining({ level: "warning" })
      );
      spy.mockRestore();
    });

    it("does not report to Sentry when window is undefined", async () => {
      const origWindow = globalThis.window;
      // @ts-expect-error - simulating server environment
      delete globalThis.window;
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      mockCaptureMessage.mockClear();
      reportSlowQuery("/api/slow", 3000);
      await new Promise((r) => setTimeout(r, 50));
      expect(mockCaptureMessage).not.toHaveBeenCalled();
      spy.mockRestore();
      globalThis.window = origWindow;
    });

    it("handles Sentry import failure gracefully", async () => {
      // Temporarily make Sentry mock throw
      mockCaptureMessage.mockImplementation(() => {
        throw new Error("Sentry error");
      });
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      reportSlowQuery("/api/slow-sentry-fail", 3000);
      await new Promise((r) => setTimeout(r, 50));
      // Should not propagate the error
      spy.mockRestore();
      mockCaptureMessage.mockReset();
    });
  });

  describe("reportWebVitals edge cases", () => {
    it("sets page to empty string when window is undefined", () => {
      const origWindow = globalThis.window;
      // @ts-expect-error - simulating server environment
      delete globalThis.window;

      // Restore navigator for sendBeacon
      const mockSendBeacon = vi.fn(() => true);
      const mockNav = { sendBeacon: mockSendBeacon };
      Object.defineProperty(globalThis, "navigator", {
        value: mockNav,
        writable: true,
        configurable: true,
      });

      reportWebVitals({
        name: "LCP",
        value: 2500,
        rating: "good",
        id: "v1-123",
        delta: 100,
      });

      const body = JSON.parse((mockSendBeacon.mock.calls[0] as unknown[])[1] as string);
      expect(body.page).toBe("");

      globalThis.window = origWindow;
    });
  });
});
