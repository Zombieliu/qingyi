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
});
