import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/web-vitals", () => ({
  reportWebVitals: vi.fn(),
}));

vi.mock("web-vitals", () => ({
  onCLS: vi.fn(),
  onLCP: vi.fn(),
  onFCP: vi.fn(),
  onTTFB: vi.fn(),
  onINP: vi.fn(),
}));

import WebVitalsReporter from "../web-vitals-reporter";

describe("WebVitalsReporter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders null", () => {
    const { container } = render(<WebVitalsReporter />);
    expect(container.innerHTML).toBe("");
  });

  it("registers web vitals callbacks on mount", async () => {
    const webVitals = await import("web-vitals");
    render(<WebVitalsReporter />);

    // Wait for dynamic import to resolve
    await vi.waitFor(() => {
      expect(webVitals.onCLS).toHaveBeenCalled();
      expect(webVitals.onLCP).toHaveBeenCalled();
      expect(webVitals.onFCP).toHaveBeenCalled();
      expect(webVitals.onTTFB).toHaveBeenCalled();
      expect(webVitals.onINP).toHaveBeenCalled();
    });
  });

  it("passes reportWebVitals to each web vital callback", async () => {
    const { reportWebVitals } = await import("@/lib/web-vitals");
    const webVitals = await import("web-vitals");
    render(<WebVitalsReporter />);

    await vi.waitFor(() => {
      expect(webVitals.onCLS).toHaveBeenCalledWith(reportWebVitals);
      expect(webVitals.onLCP).toHaveBeenCalledWith(reportWebVitals);
      expect(webVitals.onFCP).toHaveBeenCalledWith(reportWebVitals);
      expect(webVitals.onTTFB).toHaveBeenCalledWith(reportWebVitals);
      expect(webVitals.onINP).toHaveBeenCalledWith(reportWebVitals);
    });
  });

  it("handles import failure gracefully (catch branch)", async () => {
    // Make the then callback throw to trigger the catch branch
    const webVitals = await import("web-vitals");
    vi.mocked(webVitals.onCLS).mockImplementation(() => {
      throw new Error("module not available");
    });

    // The component should not throw even if web-vitals callbacks fail
    const { container } = render(<WebVitalsReporter />);
    expect(container.innerHTML).toBe("");

    // Wait for the dynamic import + catch to complete
    await new Promise((r) => setTimeout(r, 50));
  });
});
