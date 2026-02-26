import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

const mockPrefetch = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: mockPrefetch }),
}));

import { RoutePrefetcher } from "../route-prefetcher";

describe("RoutePrefetcher", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders null", () => {
    const { container } = render(<RoutePrefetcher />);
    expect(container.innerHTML).toBe("");
  });

  it("prefetches routes using requestIdleCallback", () => {
    let idleCallback: (() => void) | null = null;
    const mockRequestIdleCallback = vi.fn((cb: () => void) => {
      idleCallback = cb;
      return 1;
    });
    const mockCancelIdleCallback = vi.fn();
    // @ts-expect-error - mock requestIdleCallback
    window.requestIdleCallback = mockRequestIdleCallback;
    window.cancelIdleCallback = mockCancelIdleCallback;

    render(<RoutePrefetcher />);

    expect(mockRequestIdleCallback).toHaveBeenCalled();

    // Execute the idle callback
    if (idleCallback) (idleCallback as () => void)();

    expect(mockPrefetch).toHaveBeenCalledWith("/");
    expect(mockPrefetch).toHaveBeenCalledWith("/me");
    expect(mockPrefetch).toHaveBeenCalledWith("/me/orders");
    expect(mockPrefetch).toHaveBeenCalledWith("/faq");
    expect(mockPrefetch).toHaveBeenCalledWith("/pricing");
  });

  it("falls back to setTimeout when requestIdleCallback is not available", () => {
    vi.useFakeTimers();
    // @ts-expect-error - remove requestIdleCallback mock
    delete window.requestIdleCallback;

    render(<RoutePrefetcher />);

    vi.advanceTimersByTime(3000);

    expect(mockPrefetch).toHaveBeenCalledWith("/");
    expect(mockPrefetch).toHaveBeenCalledWith("/me");

    vi.useRealTimers();
  });
});
