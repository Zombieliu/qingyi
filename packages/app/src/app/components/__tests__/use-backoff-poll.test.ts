import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBackoffPoll } from "../use-backoff-poll";

describe("useBackoffPoll", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Ensure document.visibilityState is "visible"
    Object.defineProperty(document, "visibilityState", {
      value: "visible",
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("does not poll when enabled is false", () => {
    const onPoll = vi.fn().mockResolvedValue(true);
    renderHook(() => useBackoffPoll({ enabled: false, baseMs: 1000, maxMs: 8000, onPoll }));
    vi.advanceTimersByTime(5000);
    expect(onPoll).not.toHaveBeenCalled();
  });

  it("polls immediately when enabled", async () => {
    const onPoll = vi.fn().mockResolvedValue(true);
    renderHook(() => useBackoffPoll({ enabled: true, baseMs: 1000, maxMs: 8000, onPoll }));
    // immediate schedule with delay=0
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(onPoll).toHaveBeenCalledTimes(1);
  });

  it("schedules next poll at baseMs after successful poll", async () => {
    const onPoll = vi.fn().mockResolvedValue(true);
    renderHook(() => useBackoffPoll({ enabled: true, baseMs: 1000, maxMs: 8000, onPoll }));
    // first immediate poll
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(onPoll).toHaveBeenCalledTimes(1);
    // advance by baseMs for next poll
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(onPoll).toHaveBeenCalledTimes(2);
  });

  it("backs off delay on failed poll", async () => {
    const onPoll = vi.fn().mockResolvedValue(false);
    renderHook(() => useBackoffPoll({ enabled: true, baseMs: 1000, maxMs: 16000, onPoll }));
    // first immediate poll (fails)
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(onPoll).toHaveBeenCalledTimes(1);
    // next delay should be 1000 * 1.7 = 1700
    await act(async () => {
      vi.advanceTimersByTime(1699);
    });
    expect(onPoll).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(onPoll).toHaveBeenCalledTimes(2);
  });

  it("caps delay at maxMs", async () => {
    const onPoll = vi.fn().mockResolvedValue(false);
    renderHook(() => useBackoffPoll({ enabled: true, baseMs: 5000, maxMs: 6000, onPoll }));
    // first immediate poll
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    // 5000 * 1.7 = 8500, capped to 6000
    await act(async () => {
      vi.advanceTimersByTime(6000);
    });
    expect(onPoll).toHaveBeenCalledTimes(2);
  });

  it("resets delay to baseMs after a successful poll", async () => {
    const onPoll = vi
      .fn()
      .mockResolvedValueOnce(false) // first: fail
      .mockResolvedValueOnce(true); // second: success
    renderHook(() => useBackoffPoll({ enabled: true, baseMs: 1000, maxMs: 8000, onPoll }));
    // first immediate poll (fail)
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    // second poll at 1700ms (backoff)
    await act(async () => {
      vi.advanceTimersByTime(1700);
    });
    expect(onPoll).toHaveBeenCalledTimes(2);
    // third poll should be at baseMs=1000 since second succeeded
    onPoll.mockResolvedValue(true);
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(onPoll).toHaveBeenCalledTimes(3);
  });

  it("cleans up timer on unmount", async () => {
    const onPoll = vi.fn().mockResolvedValue(true);
    const { unmount } = renderHook(() =>
      useBackoffPoll({ enabled: true, baseMs: 1000, maxMs: 8000, onPoll })
    );
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(onPoll).toHaveBeenCalledTimes(1);
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(onPoll).toHaveBeenCalledTimes(1);
  });

  it("handles poll throwing an exception as failure", async () => {
    const onPoll = vi.fn().mockRejectedValue(new Error("network"));
    renderHook(() => useBackoffPoll({ enabled: true, baseMs: 1000, maxMs: 8000, onPoll }));
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    expect(onPoll).toHaveBeenCalledTimes(1);
    // should still schedule next poll with backoff (1700)
    await act(async () => {
      vi.advanceTimersByTime(1700);
    });
    expect(onPoll).toHaveBeenCalledTimes(2);
  });
});
