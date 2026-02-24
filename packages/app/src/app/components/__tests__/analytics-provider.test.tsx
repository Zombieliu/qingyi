import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(),
  syncAttributionFromLocation: vi.fn(),
  trackEvent: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
  useSearchParams: mocks.useSearchParams,
}));

vi.mock("@/lib/services/analytics", () => ({
  syncAttributionFromLocation: mocks.syncAttributionFromLocation,
  trackEvent: mocks.trackEvent,
}));

import AnalyticsProvider from "../analytics-provider";

describe("AnalyticsProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.usePathname.mockReturnValue("/home");
    mocks.useSearchParams.mockReturnValue({ toString: () => "" });
  });

  it("renders null", () => {
    const { container } = render(<AnalyticsProvider />);
    expect(container.innerHTML).toBe("");
  });

  it("tracks page_view on mount", () => {
    render(<AnalyticsProvider />);
    expect(mocks.syncAttributionFromLocation).toHaveBeenCalled();
    expect(mocks.trackEvent).toHaveBeenCalledWith("page_view", {
      path: "/home",
      query: "",
    });
  });

  it("tracks page_view with search params", () => {
    mocks.useSearchParams.mockReturnValue({ toString: () => "ref=abc" });
    render(<AnalyticsProvider />);
    expect(mocks.trackEvent).toHaveBeenCalledWith("page_view", {
      path: "/home",
      query: "ref=abc",
    });
  });

  it("skips tracking on admin routes", () => {
    mocks.usePathname.mockReturnValue("/admin/dashboard");
    render(<AnalyticsProvider />);
    expect(mocks.syncAttributionFromLocation).not.toHaveBeenCalled();
    expect(mocks.trackEvent).not.toHaveBeenCalled();
  });

  it("handles null searchParams", () => {
    mocks.useSearchParams.mockReturnValue(null);
    render(<AnalyticsProvider />);
    expect(mocks.trackEvent).toHaveBeenCalledWith("page_view", {
      path: "/home",
      query: "",
    });
  });
});
