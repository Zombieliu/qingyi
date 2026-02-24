import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";

const mockGetCurrentAddress = vi.fn();
vi.mock("@/lib/chain/qy-chain-lite", () => ({
  getCurrentAddress: () => mockGetCurrentAddress(),
}));

const mockFetchWithUserAuth = vi.fn();
vi.mock("@/lib/auth/user-auth-client", () => ({
  fetchWithUserAuth: (...args: unknown[]) => mockFetchWithUserAuth(...args),
}));

import { useUnreadCount } from "../use-notifications";

function makeOkResponse(data: unknown) {
  return { ok: true, json: () => Promise.resolve(data) };
}

describe("useUnreadCount", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetCurrentAddress.mockReturnValue("0xabc");
    mockFetchWithUserAuth.mockResolvedValue(makeOkResponse({ unread: 5 }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns initial count of 0 before fetch resolves", () => {
    mockGetCurrentAddress.mockReturnValue("");
    const { result } = renderHook(() => useUnreadCount());
    expect(result.current.count).toBe(0);
  });

  it("fetches unread count on mount when address exists", async () => {
    renderHook(() => useUnreadCount());
    await waitFor(() => {
      expect(mockFetchWithUserAuth).toHaveBeenCalledWith(
        "/api/notifications?address=0xabc&countOnly=1",
        {},
        "0xabc"
      );
    });
  });

  it("updates count from API response", async () => {
    const { result } = renderHook(() => useUnreadCount());
    await waitFor(() => {
      expect(result.current.count).toBe(5);
    });
  });

  it("does not fetch when address is empty", () => {
    mockGetCurrentAddress.mockReturnValue("");
    renderHook(() => useUnreadCount());
    expect(mockFetchWithUserAuth).not.toHaveBeenCalled();
  });

  it("sets up interval for polling", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUnreadCount());
    // Flush initial fetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    const callsAfterMount = mockFetchWithUserAuth.mock.calls.length;
    // Advance 30s for interval
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(mockFetchWithUserAuth.mock.calls.length).toBeGreaterThan(callsAfterMount);
    vi.useRealTimers();
  });

  it("increments count on qy:notification window event", async () => {
    const { result } = renderHook(() => useUnreadCount());
    await waitFor(() => {
      expect(result.current.count).toBe(5);
    });
    act(() => {
      window.dispatchEvent(new Event("qy:notification"));
    });
    expect(result.current.count).toBe(6);
  });

  it("exposes a refresh function that re-fetches", async () => {
    const { result } = renderHook(() => useUnreadCount());
    await waitFor(() => {
      expect(result.current.count).toBe(5);
    });
    mockFetchWithUserAuth.mockResolvedValue(makeOkResponse({ unread: 10 }));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.count).toBe(10);
  });

  it("handles fetch failure gracefully and keeps count at 0", async () => {
    mockFetchWithUserAuth.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useUnreadCount());
    // Wait a tick for the effect to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(result.current.count).toBe(0);
  });
});
