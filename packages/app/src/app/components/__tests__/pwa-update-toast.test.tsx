import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@/lib/i18n/t", () => ({
  t: (key: string) => key,
}));

import PwaUpdateToast from "../pwa-update-toast";

type ListenerMap = Record<string, (() => void)[]>;

function createSerwist() {
  const listeners: ListenerMap = {};
  return {
    listeners,
    mock: {
      addEventListener: (event: string, cb: () => void) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(cb);
      },
      removeEventListener: vi.fn(),
    },
  };
}

describe("PwaUpdateToast", () => {
  let originalLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    originalLocation = window.location;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).serwist;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).serwist;
  });

  it("renders nothing when not ready", () => {
    const { container } = render(<PwaUpdateToast />);
    expect(container.innerHTML).toBe("");
  });

  it("shows toast when serwist fires waiting event", () => {
    const { listeners, mock } = createSerwist();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).serwist = mock;
    render(<PwaUpdateToast />);
    act(() => {
      listeners["waiting"]?.forEach((cb) => cb());
    });
    expect(screen.getByText("ui.pwa-update-toast.501")).toBeInTheDocument();
    expect(screen.getByText("更新")).toBeInTheDocument();
  });

  it("reloads page when serwist fires controlling event", () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    });
    const { listeners, mock } = createSerwist();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).serwist = mock;
    render(<PwaUpdateToast />);
    act(() => {
      listeners["controlling"]?.forEach((cb) => cb());
    });
    expect(reloadMock).toHaveBeenCalled();
  });

  it("hides toast when close button is clicked", () => {
    const { listeners, mock } = createSerwist();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).serwist = mock;
    render(<PwaUpdateToast />);
    act(() => {
      listeners["waiting"]?.forEach((cb) => cb());
    });
    fireEvent.click(screen.getByLabelText("comp.pwa_update_toast.001"));
    expect(screen.queryByText("ui.pwa-update-toast.501")).not.toBeInTheDocument();
  });

  it("activate: posts SKIP_WAITING to waiting SW", async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    });
    const { listeners, mock } = createSerwist();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).serwist = mock;
    const postMsg = vi.fn();
    vi.stubGlobal("navigator", {
      ...navigator,
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          waiting: { postMessage: postMsg },
          update: vi.fn().mockResolvedValue(undefined),
        }),
      },
    });
    render(<PwaUpdateToast />);
    act(() => {
      listeners["waiting"]?.forEach((cb) => cb());
    });
    await act(async () => {
      fireEvent.click(screen.getByText("更新"));
    });
    expect(postMsg).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(reloadMock).toHaveBeenCalled();
  });

  it("activate: falls back to messageSkipWaiting when no waiting worker", async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    });
    const skipMock = vi.fn();
    const { listeners, mock } = createSerwist();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).serwist = { ...mock, messageSkipWaiting: skipMock };
    vi.stubGlobal("navigator", {
      ...navigator,
      serviceWorker: {
        getRegistration: vi.fn().mockResolvedValue({
          waiting: null,
          update: vi.fn().mockResolvedValue(undefined),
        }),
      },
    });
    render(<PwaUpdateToast />);
    act(() => {
      listeners["waiting"]?.forEach((cb) => cb());
    });
    await act(async () => {
      fireEvent.click(screen.getByText("更新"));
    });
    expect(skipMock).toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(reloadMock).toHaveBeenCalled();
  });

  it("activate: reloads on error (catch branch)", async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    });
    const { listeners, mock } = createSerwist();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).serwist = mock;
    vi.stubGlobal("navigator", {
      ...navigator,
      serviceWorker: {
        getRegistration: vi.fn().mockRejectedValue(new Error("sw error")),
      },
    });
    render(<PwaUpdateToast />);
    act(() => {
      listeners["waiting"]?.forEach((cb) => cb());
    });
    await act(async () => {
      fireEvent.click(screen.getByText("更新"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(reloadMock).toHaveBeenCalled();
  });

  it("activate: returns early when serviceWorker not in navigator", async () => {
    const { listeners, mock } = createSerwist();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).serwist = mock;
    vi.stubGlobal("navigator", {});
    render(<PwaUpdateToast />);
    act(() => {
      listeners["waiting"]?.forEach((cb) => cb());
    });
    await act(async () => {
      fireEvent.click(screen.getByText("更新"));
    });
  });

  it("cleans up event listeners on unmount", () => {
    const { mock } = createSerwist();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).serwist = mock;
    const { unmount } = render(<PwaUpdateToast />);
    unmount();
    expect(mock.removeEventListener).toHaveBeenCalledWith("waiting", expect.any(Function));
    expect(mock.removeEventListener).toHaveBeenCalledWith("controlling", expect.any(Function));
  });

  it("has correct accessibility attributes", () => {
    const { listeners, mock } = createSerwist();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).serwist = mock;
    render(<PwaUpdateToast />);
    act(() => {
      listeners["waiting"]?.forEach((cb) => cb());
    });
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
