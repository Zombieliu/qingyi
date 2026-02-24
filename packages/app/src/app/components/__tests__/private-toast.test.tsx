import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("@/lib/i18n/t", () => ({
  t: (key: string) => key,
}));

import PwaUpdateToast from "../pwa-update-toast";

type SerwistListener = () => void;

function setupSerwist() {
  const listeners: Record<string, SerwistListener> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).serwist = {
    addEventListener: (event: string, cb: SerwistListener) => {
      listeners[event] = cb;
    },
    removeEventListener: vi.fn(),
    messageSkipWaiting: vi.fn(),
  };
  return listeners;
}

function cleanupSerwist() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).serwist;
}

describe("PwaUpdateToast", () => {
  let originalLocation: Location;

  beforeEach(() => {
    vi.clearAllMocks();
    originalLocation = window.location;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanupSerwist();
    if (window.location !== originalLocation) {
      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
        configurable: true,
      });
    }
  });

  it("renders nothing when not ready", () => {
    const { container } = render(<PwaUpdateToast />);
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when serwist is not present", () => {
    // No serwist on window
    const { container } = render(<PwaUpdateToast />);
    expect(container.innerHTML).toBe("");
  });

  it("renders toast when serwist fires waiting event", async () => {
    const listeners = setupSerwist();
    render(<PwaUpdateToast />);
    act(() => {
      listeners["waiting"]?.();
    });
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
  });

  it("controlling event triggers location.reload", async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    });
    const listeners = setupSerwist();
    render(<PwaUpdateToast />);
    act(() => {
      listeners["controlling"]?.();
    });
    expect(reloadMock).toHaveBeenCalled();
  });

  it("dismiss button hides the toast", async () => {
    const listeners = setupSerwist();
    render(<PwaUpdateToast />);
    act(() => {
      listeners["waiting"]?.();
    });
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });
    const dismissBtn = screen.getByLabelText("comp.pwa_update_toast.001");
    fireEvent.click(dismissBtn);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("activate sends SKIP_WAITING when reg.waiting exists", async () => {
    const postMessageMock = vi.fn();
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        getRegistration: vi.fn().mockResolvedValue({
          waiting: { postMessage: postMessageMock },
          update: vi.fn(),
        }),
      },
      writable: true,
      configurable: true,
    });

    const listeners = setupSerwist();
    render(<PwaUpdateToast />);
    act(() => {
      listeners["waiting"]?.();
    });
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    const updateBtn = screen.getByText("更新");
    await act(async () => {
      fireEvent.click(updateBtn);
    });

    expect(postMessageMock).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    await waitFor(
      () => {
        expect(reloadMock).toHaveBeenCalled();
      },
      { timeout: 2000 }
    );
  });

  it("activate calls messageSkipWaiting and update when no waiting worker", async () => {
    const updateMock = vi.fn().mockResolvedValue(undefined);
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        getRegistration: vi.fn().mockResolvedValue({
          waiting: null,
          update: updateMock,
        }),
      },
      writable: true,
      configurable: true,
    });

    const listeners = setupSerwist();
    render(<PwaUpdateToast />);
    act(() => {
      listeners["waiting"]?.();
    });
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    const updateBtn = screen.getByText("更新");
    await act(async () => {
      fireEvent.click(updateBtn);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((window as any).serwist.messageSkipWaiting).toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalled();
    await waitFor(
      () => {
        expect(reloadMock).toHaveBeenCalled();
      },
      { timeout: 2000 }
    );
  });

  it("activate handles error and still reloads", async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        getRegistration: vi.fn().mockRejectedValue(new Error("fail")),
      },
      writable: true,
      configurable: true,
    });

    const listeners = setupSerwist();
    render(<PwaUpdateToast />);
    act(() => {
      listeners["waiting"]?.();
    });
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    const updateBtn = screen.getByText("更新");
    await act(async () => {
      fireEvent.click(updateBtn);
    });

    await waitFor(
      () => {
        expect(reloadMock).toHaveBeenCalled();
      },
      { timeout: 2000 }
    );
  });

  it("activate does nothing when no serviceWorker in navigator", async () => {
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, reload: reloadMock },
      writable: true,
      configurable: true,
    });
    // Remove serviceWorker from navigator
    const origSW = navigator.serviceWorker;
    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    const listeners = setupSerwist();
    render(<PwaUpdateToast />);
    act(() => {
      listeners["waiting"]?.();
    });
    await waitFor(() => {
      expect(screen.getByRole("status")).toBeInTheDocument();
    });

    const updateBtn = screen.getByText("更新");
    await act(async () => {
      fireEvent.click(updateBtn);
    });

    // Should not reload since early return
    expect(reloadMock).not.toHaveBeenCalled();

    // Restore
    Object.defineProperty(navigator, "serviceWorker", {
      value: origSW,
      writable: true,
      configurable: true,
    });
  });
});
