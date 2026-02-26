import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";

vi.mock("@/lib/i18n/t", () => ({
  t: (key: string) => key,
}));

function setupServiceWorker(reg: unknown) {
  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      getRegistration: vi.fn().mockResolvedValue(reg),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
    writable: true,
    configurable: true,
  });
}

describe("SwControl", () => {
  let SwControl: typeof import("../sw-control").default;
  let originalLocation: Location;

  beforeEach(async () => {
    vi.clearAllMocks();
    originalLocation = window.location;
    setupServiceWorker(null);
    vi.resetModules();
    const mod = await import("../sw-control");
    SwControl = mod.default;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (window.location !== originalLocation) {
      Object.defineProperty(window, "location", {
        value: originalLocation,
        writable: true,
        configurable: true,
      });
    }
  });

  it("renders SW label", () => {
    render(<SwControl />);
    expect(screen.getByText(/SW/)).toBeInTheDocument();
  });

  it("shows unsupported when no serviceWorker in navigator", async () => {
    const origSW = navigator.serviceWorker;
    Object.defineProperty(navigator, "serviceWorker", {
      value: undefined,
      writable: true,
      configurable: true,
    });
    // Need to also remove the "serviceWorker" property check
    const desc = Object.getOwnPropertyDescriptor(navigator, "serviceWorker");
    const nav = navigator as unknown as { serviceWorker?: unknown };
    delete nav.serviceWorker;

    vi.resetModules();
    const mod = await import("../sw-control");
    SwControl = mod.default;

    render(<SwControl />);
    await waitFor(() => {
      expect(screen.getByText(/components.sw_control.i170/)).toBeInTheDocument();
    });

    // Restore
    Object.defineProperty(navigator, "serviceWorker", {
      value: origSW,
      writable: true,
      configurable: true,
    });
  });

  it("shows long script name truncated", async () => {
    setupServiceWorker({
      active: {
        scriptURL: "https://example.com/very-long-service-worker-name-that-exceeds-twenty-chars.js",
      },
      waiting: null,
      installing: null,
    });
    vi.resetModules();
    const mod = await import("../sw-control");
    SwControl = mod.default;

    render(<SwControl />);
    await waitFor(() => {
      // The shortScript function truncates names > 20 chars
      expect(screen.getByText(/…/)).toBeInTheDocument();
    });
  });

  it("transitions from ready to idle when waiting is cleared", async () => {
    // Start with a waiting worker
    const updateMock = vi.fn().mockResolvedValue(undefined);
    const reg = {
      active: { scriptURL: "https://example.com/sw.js" },
      waiting: { scriptURL: "https://example.com/sw-new.js" },
      installing: null,
      update: updateMock,
    };
    setupServiceWorker(reg);
    vi.resetModules();
    const mod = await import("../sw-control");
    SwControl = mod.default;

    render(<SwControl />);
    await waitFor(() => {
      expect(screen.getByText(/sw-new\.js/)).toBeInTheDocument();
    });

    // Now simulate the waiting worker being consumed (checkUpdate with no waiting)
    reg.waiting = null as unknown as typeof reg.waiting;
    const checkBtn = screen.getByText("comp.sw_control.009");
    await act(async () => {
      fireEvent.click(checkBtn);
    });

    await waitFor(() => {
      expect(screen.getByText("comp.sw_control.002")).toBeInTheDocument();
    });
  });

  it("handles controllerchange event", async () => {
    let controllerChangeHandler: (() => void) | null = null;
    const addEventListenerMock = vi.fn((event: string, cb: () => void) => {
      if (event === "controllerchange") controllerChangeHandler = cb;
    });
    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        getRegistration: vi.fn().mockResolvedValue(null),
        addEventListener: addEventListenerMock,
        removeEventListener: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
    vi.resetModules();
    const mod = await import("../sw-control");
    SwControl = mod.default;

    render(<SwControl />);
    await waitFor(() => {
      expect(screen.getByText(/components.sw_control.i171/)).toBeInTheDocument();
    });

    // Verify controllerchange listener was registered
    expect(addEventListenerMock).toHaveBeenCalledWith("controllerchange", expect.any(Function));

    // Trigger the controllerchange event
    if (controllerChangeHandler) {
      await act(async () => {
        controllerChangeHandler!();
      });
    }
  });

  it("shows invalid URL in shortScript catch branch", async () => {
    setupServiceWorker({
      active: { scriptURL: "not-a-valid-url" },
      waiting: null,
      installing: null,
    });
    vi.resetModules();
    const mod = await import("../sw-control");
    SwControl = mod.default;

    render(<SwControl />);
    await waitFor(() => {
      expect(screen.getByText(/not-a-valid-url/)).toBeInTheDocument();
    });
  });

  it("renders check update button", () => {
    render(<SwControl />);
    expect(screen.getByText("comp.sw_control.009")).toBeInTheDocument();
  });

  it("renders force update button", () => {
    render(<SwControl />);
    expect(screen.getByText("comp.sw_control.010")).toBeInTheDocument();
  });

  it("renders clear cache button", () => {
    render(<SwControl />);
    expect(screen.getByText("comp.sw_control.011")).toBeInTheDocument();
  });

  it("shows no-sw status when no registration", async () => {
    render(<SwControl />);
    await waitFor(() => {
      expect(screen.getByText(/components.sw_control.i171/)).toBeInTheDocument();
    });
  });

  it("shows active SW script when registration exists", async () => {
    setupServiceWorker({
      active: { scriptURL: "https://example.com/sw.js" },
      waiting: null,
      installing: null,
    });
    vi.resetModules();
    const mod = await import("../sw-control");
    SwControl = mod.default;

    render(<SwControl />);
    await waitFor(() => {
      expect(screen.getByText(/sw\.js/)).toBeInTheDocument();
    });
  });

  it("shows waiting SW script when waiting exists", async () => {
    setupServiceWorker({
      active: { scriptURL: "https://example.com/sw.js" },
      waiting: { scriptURL: "https://example.com/sw-new.js" },
      installing: null,
    });
    vi.resetModules();
    const mod = await import("../sw-control");
    SwControl = mod.default;

    render(<SwControl />);
    await waitFor(() => {
      expect(screen.getByText(/sw-new\.js/)).toBeInTheDocument();
    });
  });

  describe("checkUpdate", () => {
    it("shows message when no registration found", async () => {
      render(<SwControl />);
      await waitFor(() => {
        expect(screen.getByText(/components.sw_control.i171/)).toBeInTheDocument();
      });

      const btn = screen.getByText("comp.sw_control.009");
      await act(async () => {
        fireEvent.click(btn);
      });

      await waitFor(() => {
        expect(screen.getByText("comp.sw_control.001")).toBeInTheDocument();
      });
    });

    it("calls reg.update and shows no-update message", async () => {
      const updateMock = vi.fn().mockResolvedValue(undefined);
      setupServiceWorker({
        active: { scriptURL: "https://example.com/sw.js" },
        waiting: null,
        installing: null,
        update: updateMock,
      });
      vi.resetModules();
      const mod = await import("../sw-control");
      SwControl = mod.default;

      render(<SwControl />);
      await waitFor(() => {
        expect(screen.getByText(/sw\.js/)).toBeInTheDocument();
      });

      const btn = screen.getByText("comp.sw_control.009");
      await act(async () => {
        fireEvent.click(btn);
      });

      expect(updateMock).toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.getByText("comp.sw_control.002")).toBeInTheDocument();
      });
    });

    it("shows error message when update throws", async () => {
      const updateMock = vi.fn().mockRejectedValue(new Error("network"));
      setupServiceWorker({
        active: { scriptURL: "https://example.com/sw.js" },
        waiting: null,
        installing: null,
        update: updateMock,
      });
      vi.resetModules();
      const mod = await import("../sw-control");
      SwControl = mod.default;

      render(<SwControl />);
      await waitFor(() => {
        expect(screen.getByText(/sw\.js/)).toBeInTheDocument();
      });

      const btn = screen.getByText("comp.sw_control.009");
      await act(async () => {
        fireEvent.click(btn);
      });

      await waitFor(() => {
        expect(screen.getByText("comp.sw_control.003")).toBeInTheDocument();
      });
    });
  });

  describe("forceUpdate", () => {
    it("shows message when no registration", async () => {
      render(<SwControl />);
      await waitFor(() => {
        expect(screen.getByText(/components.sw_control.i171/)).toBeInTheDocument();
      });

      const btn = screen.getByText("comp.sw_control.010");
      await act(async () => {
        fireEvent.click(btn);
      });

      await waitFor(() => {
        expect(screen.getByText("comp.sw_control.004")).toBeInTheDocument();
      });
    });

    it("posts SKIP_WAITING when waiting worker exists", async () => {
      const postMessageMock = vi.fn();
      const reloadMock = vi.fn();
      Object.defineProperty(window, "location", {
        value: { ...originalLocation, reload: reloadMock },
        writable: true,
        configurable: true,
      });

      setupServiceWorker({
        active: { scriptURL: "https://example.com/sw.js" },
        waiting: { scriptURL: "https://example.com/sw-new.js", postMessage: postMessageMock },
        installing: null,
        update: vi.fn().mockResolvedValue(undefined),
      });
      vi.resetModules();
      const mod = await import("../sw-control");
      SwControl = mod.default;

      render(<SwControl />);
      await waitFor(() => {
        expect(screen.getByText(/sw-new\.js/)).toBeInTheDocument();
      });

      const btn = screen.getByText("comp.sw_control.010");
      await act(async () => {
        fireEvent.click(btn);
      });

      expect(postMessageMock).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
      await waitFor(() => {
        expect(screen.getByText("comp.sw_control.005")).toBeInTheDocument();
      });
      await waitFor(
        () => {
          expect(reloadMock).toHaveBeenCalled();
        },
        { timeout: 2000 }
      );
    });

    it("calls messageSkipWaiting and update when no waiting worker", async () => {
      const updateMock = vi.fn().mockResolvedValue(undefined);
      const messageSkipWaiting = vi.fn();
      const reloadMock = vi.fn();
      Object.defineProperty(window, "location", {
        value: { ...originalLocation, reload: reloadMock },
        writable: true,
        configurable: true,
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).serwist = { messageSkipWaiting };

      setupServiceWorker({
        active: { scriptURL: "https://example.com/sw.js" },
        waiting: null,
        installing: null,
        update: updateMock,
      });
      vi.resetModules();
      const mod = await import("../sw-control");
      SwControl = mod.default;

      render(<SwControl />);
      await waitFor(() => {
        expect(screen.getByText(/sw\.js/)).toBeInTheDocument();
      });

      const btn = screen.getByText("comp.sw_control.010");
      await act(async () => {
        fireEvent.click(btn);
      });

      expect(messageSkipWaiting).toHaveBeenCalled();
      expect(updateMock).toHaveBeenCalled();

      await waitFor(
        () => {
          expect(reloadMock).toHaveBeenCalled();
        },
        { timeout: 2000 }
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).serwist;
    });

    it("shows error when forceUpdate throws", async () => {
      const getRegMock = vi.fn().mockResolvedValue(null);
      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          getRegistration: getRegMock,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        },
        writable: true,
        configurable: true,
      });
      vi.resetModules();
      const mod = await import("../sw-control");
      SwControl = mod.default;

      render(<SwControl />);
      await waitFor(() => {
        expect(screen.getByText(/components.sw_control.i171/)).toBeInTheDocument();
      });

      // Make getRegistration reject once for forceUpdate, then resolve again
      getRegMock.mockRejectedValueOnce(new Error("fail"));

      const btn = screen.getByText("comp.sw_control.010");
      await act(async () => {
        fireEvent.click(btn);
      });

      await waitFor(() => {
        expect(screen.getByText("comp.sw_control.006")).toBeInTheDocument();
      });
    });
  });

  describe("clearCache", () => {
    it("clears caches and updates registration", async () => {
      const updateMock = vi.fn().mockResolvedValue(undefined);
      const deleteMock = vi.fn().mockResolvedValue(true);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).caches = {
        keys: vi.fn().mockResolvedValue(["cache-1", "cache-2"]),
        delete: deleteMock,
      };

      setupServiceWorker({
        active: { scriptURL: "https://example.com/sw.js" },
        waiting: null,
        installing: null,
        update: updateMock,
      });
      vi.resetModules();
      const mod = await import("../sw-control");
      SwControl = mod.default;

      render(<SwControl />);
      await waitFor(() => {
        expect(screen.getByText(/sw\.js/)).toBeInTheDocument();
      });

      const btn = screen.getByText("comp.sw_control.011");
      await act(async () => {
        fireEvent.click(btn);
      });

      expect(deleteMock).toHaveBeenCalledTimes(2);
      expect(updateMock).toHaveBeenCalled();
      await waitFor(() => {
        expect(screen.getByText("comp.sw_control.007")).toBeInTheDocument();
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).caches;
    });

    it("clears caches without registration", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).caches = {
        keys: vi.fn().mockResolvedValue([]),
        delete: vi.fn(),
      };

      render(<SwControl />);
      await waitFor(() => {
        expect(screen.getByText(/components.sw_control.i171/)).toBeInTheDocument();
      });

      const btn = screen.getByText("comp.sw_control.011");
      await act(async () => {
        fireEvent.click(btn);
      });

      await waitFor(() => {
        expect(screen.getByText("comp.sw_control.007")).toBeInTheDocument();
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).caches;
    });

    it("shows error when clearCache throws", async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).caches = {
        keys: vi.fn().mockRejectedValue(new Error("fail")),
      };

      render(<SwControl />);

      const btn = screen.getByText("comp.sw_control.011");
      await act(async () => {
        fireEvent.click(btn);
      });

      await waitFor(() => {
        expect(screen.getByText("comp.sw_control.008")).toBeInTheDocument();
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).caches;
    });
  });
});
