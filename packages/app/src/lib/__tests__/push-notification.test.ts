import { describe, it, expect, vi, beforeEach } from "vitest";

// Save originals before any mocking
const originalWindow = globalThis.window;

// We need to test a "use client" module that checks browser APIs
// jsdom provides window/navigator, so we selectively override for specific tests

import {
  isPushSupported,
  getPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
} from "../push-notification";

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  // Reset env
  delete process.env.NEXT_PUBLIC_FF_PUSH_NOTIFICATIONS;
});

describe("isPushSupported", () => {
  it("returns false when serviceWorker is not in navigator", () => {
    const origSW = navigator.serviceWorker;
    // @ts-expect-error - removing for test
    delete navigator.serviceWorker;

    expect(isPushSupported()).toBe(false);

    Object.defineProperty(navigator, "serviceWorker", {
      value: origSW,
      configurable: true,
      writable: true,
    });
  });

  it("returns true when all APIs are available", () => {
    // jsdom + our setup should have window defined
    // We need to ensure serviceWorker, PushManager, Notification exist
    const hasSW = "serviceWorker" in navigator;
    const hasPM = "PushManager" in window;
    const hasNotif = "Notification" in window;

    if (!hasSW) {
      Object.defineProperty(navigator, "serviceWorker", {
        value: { ready: Promise.resolve({}) },
        configurable: true,
      });
    }
    if (!hasPM) {
      (window as Record<string, unknown>).PushManager = class {};
    }
    if (!hasNotif) {
      (window as Record<string, unknown>).Notification = { permission: "default" };
    }

    expect(isPushSupported()).toBe(true);

    // Cleanup
    if (!hasPM) delete (window as Record<string, unknown>).PushManager;
    if (!hasNotif) delete (window as Record<string, unknown>).Notification;
  });
});

describe("getPushPermission", () => {
  it('returns "unsupported" when push is not supported', () => {
    const origSW = navigator.serviceWorker;
    // @ts-expect-error - removing for test
    delete navigator.serviceWorker;

    expect(getPushPermission()).toBe("unsupported");

    Object.defineProperty(navigator, "serviceWorker", {
      value: origSW,
      configurable: true,
      writable: true,
    });
  });

  it("returns Notification.permission when supported", () => {
    // Ensure all APIs present
    const hasSW = "serviceWorker" in navigator;
    const hasPM = "PushManager" in window;
    const origNotif = (window as Record<string, unknown>).Notification;

    if (!hasSW) {
      Object.defineProperty(navigator, "serviceWorker", {
        value: { ready: Promise.resolve({}) },
        configurable: true,
      });
    }
    if (!hasPM) {
      (window as Record<string, unknown>).PushManager = class {};
    }
    (window as Record<string, unknown>).Notification = { permission: "granted" };

    expect(getPushPermission()).toBe("granted");

    // Cleanup
    if (!hasPM) delete (window as Record<string, unknown>).PushManager;
    if (origNotif) {
      (window as Record<string, unknown>).Notification = origNotif;
    } else {
      delete (window as Record<string, unknown>).Notification;
    }
  });
});

describe("subscribeToPush", () => {
  it("returns false when disabled via env", async () => {
    process.env.NEXT_PUBLIC_FF_PUSH_NOTIFICATIONS = "0";
    const result = await subscribeToPush("0xabc");
    expect(result).toBe(false);
  });

  it("returns false when push is not supported", async () => {
    const origSW = navigator.serviceWorker;
    // @ts-expect-error - removing for test
    delete navigator.serviceWorker;

    const result = await subscribeToPush("0xabc");
    expect(result).toBe(false);

    Object.defineProperty(navigator, "serviceWorker", {
      value: origSW,
      configurable: true,
      writable: true,
    });
  });

  it("returns false when VAPID public key is not configured", async () => {
    // VAPID_PUBLIC_KEY is captured at module load time as a const.
    // Since it's empty in the test environment, subscribeToPush returns false
    // after the isPushSupported() check passes.
    const hasSW = "serviceWorker" in navigator;
    const hasPM = "PushManager" in window;
    const origNotif = (window as Record<string, unknown>).Notification;

    if (!hasSW) {
      Object.defineProperty(navigator, "serviceWorker", {
        value: { ready: Promise.resolve({}) },
        configurable: true,
      });
    }
    if (!hasPM) {
      (window as Record<string, unknown>).PushManager = class {};
    }
    if (!origNotif) {
      (window as Record<string, unknown>).Notification = { permission: "default" };
    }

    const result = await subscribeToPush("0xabc");
    expect(result).toBe(false);

    // Cleanup
    if (!hasPM) delete (window as Record<string, unknown>).PushManager;
    if (!origNotif) delete (window as Record<string, unknown>).Notification;
  });

  it("returns true on successful subscription with VAPID key", async () => {
    // Set VAPID key before re-importing the module
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
      "BDd3_hVL9fZi9Ybo2UUzA284WG5FZR30_95YeZJsiApwXKpNcF1rRPF3foIiBHXRdJI2Qhumhf6_LFTeZaNndIo";
    vi.resetModules();
    const mod = await import("../push-notification");

    const hasSW = "serviceWorker" in navigator;
    const hasPM = "PushManager" in window;
    const origNotif = (window as Record<string, unknown>).Notification;

    const mockSubscription = {
      toJSON: () => ({ endpoint: "https://push.example.com/sub/123" }),
    };
    const mockGetSubscription = vi.fn().mockResolvedValue(null);
    const mockSubscribe = vi.fn().mockResolvedValue(mockSubscription);

    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: mockGetSubscription,
            subscribe: mockSubscribe,
          },
        }),
      },
      configurable: true,
      writable: true,
    });
    if (!hasPM) {
      (window as Record<string, unknown>).PushManager = class {};
    }
    (window as Record<string, unknown>).Notification = {
      permission: "granted",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    };

    const mockFetchLocal = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetchLocal);

    const result = await mod.subscribeToPush("0xabc");
    expect(result).toBe(true);
    expect(mockSubscribe).toHaveBeenCalled();
    expect(mockFetchLocal).toHaveBeenCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({ method: "POST" })
    );

    // Cleanup
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!hasPM) delete (window as Record<string, unknown>).PushManager;
    if (origNotif) {
      (window as Record<string, unknown>).Notification = origNotif;
    } else {
      delete (window as Record<string, unknown>).Notification;
    }
    vi.unstubAllGlobals();
  });

  it("returns false when permission is denied", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
      "BDd3_hVL9fZi9Ybo2UUzA284WG5FZR30_95YeZJsiApwXKpNcF1rRPF3foIiBHXRdJI2Qhumhf6_LFTeZaNndIo";
    vi.resetModules();
    const mod = await import("../push-notification");

    const hasPM = "PushManager" in window;
    const origNotif = (window as Record<string, unknown>).Notification;

    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        ready: Promise.resolve({
          pushManager: { getSubscription: vi.fn(), subscribe: vi.fn() },
        }),
      },
      configurable: true,
      writable: true,
    });
    if (!hasPM) {
      (window as Record<string, unknown>).PushManager = class {};
    }
    (window as Record<string, unknown>).Notification = {
      permission: "denied",
      requestPermission: vi.fn().mockResolvedValue("denied"),
    };

    const result = await mod.subscribeToPush("0xabc");
    expect(result).toBe(false);

    // Cleanup
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!hasPM) delete (window as Record<string, unknown>).PushManager;
    if (origNotif) {
      (window as Record<string, unknown>).Notification = origNotif;
    } else {
      delete (window as Record<string, unknown>).Notification;
    }
  });

  it("returns false and logs error when subscribe throws", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
      "BDd3_hVL9fZi9Ybo2UUzA284WG5FZR30_95YeZJsiApwXKpNcF1rRPF3foIiBHXRdJI2Qhumhf6_LFTeZaNndIo";
    vi.resetModules();
    const mod = await import("../push-notification");

    const hasPM = "PushManager" in window;
    const origNotif = (window as Record<string, unknown>).Notification;

    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: vi.fn().mockResolvedValue(null),
            subscribe: vi.fn().mockRejectedValue(new Error("push error")),
          },
        }),
      },
      configurable: true,
      writable: true,
    });
    if (!hasPM) {
      (window as Record<string, unknown>).PushManager = class {};
    }
    (window as Record<string, unknown>).Notification = {
      permission: "granted",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    };

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await mod.subscribeToPush("0xabc");
    expect(result).toBe(false);
    expect(consoleSpy).toHaveBeenCalled();

    // Cleanup
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!hasPM) delete (window as Record<string, unknown>).PushManager;
    if (origNotif) {
      (window as Record<string, unknown>).Notification = origNotif;
    } else {
      delete (window as Record<string, unknown>).Notification;
    }
    consoleSpy.mockRestore();
  });

  it("uses existing subscription instead of creating new one", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY =
      "BDd3_hVL9fZi9Ybo2UUzA284WG5FZR30_95YeZJsiApwXKpNcF1rRPF3foIiBHXRdJI2Qhumhf6_LFTeZaNndIo";
    vi.resetModules();
    const mod = await import("../push-notification");

    const hasPM = "PushManager" in window;
    const origNotif = (window as Record<string, unknown>).Notification;

    const existingSub = {
      toJSON: () => ({ endpoint: "https://push.example.com/existing" }),
    };
    const mockGetSubscription = vi.fn().mockResolvedValue(existingSub);
    const mockSubscribe = vi.fn();

    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        ready: Promise.resolve({
          pushManager: {
            getSubscription: mockGetSubscription,
            subscribe: mockSubscribe,
          },
        }),
      },
      configurable: true,
      writable: true,
    });
    if (!hasPM) {
      (window as Record<string, unknown>).PushManager = class {};
    }
    (window as Record<string, unknown>).Notification = {
      permission: "granted",
      requestPermission: vi.fn().mockResolvedValue("granted"),
    };

    const mockFetchLocal = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetchLocal);

    const result = await mod.subscribeToPush("0xabc");
    expect(result).toBe(true);
    expect(mockSubscribe).not.toHaveBeenCalled();

    // Cleanup
    delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!hasPM) delete (window as Record<string, unknown>).PushManager;
    if (origNotif) {
      (window as Record<string, unknown>).Notification = origNotif;
    } else {
      delete (window as Record<string, unknown>).Notification;
    }
    vi.unstubAllGlobals();
  });
});

describe("unsubscribeFromPush", () => {
  it("handles no existing subscription gracefully", async () => {
    const mockGetSubscription = vi.fn().mockResolvedValue(null);
    const origSW = navigator.serviceWorker;

    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        ready: Promise.resolve({
          pushManager: { getSubscription: mockGetSubscription },
        }),
      },
      configurable: true,
      writable: true,
    });

    const result = await unsubscribeFromPush();
    expect(result).toBe(true);
    expect(mockGetSubscription).toHaveBeenCalled();

    Object.defineProperty(navigator, "serviceWorker", {
      value: origSW,
      configurable: true,
      writable: true,
    });
  });

  it("unsubscribes existing subscription and calls DELETE", async () => {
    const mockUnsubscribe = vi.fn().mockResolvedValue(true);
    const mockSubscription = {
      unsubscribe: mockUnsubscribe,
      endpoint: "https://push.example.com/sub/123",
    };
    const mockGetSubscription = vi.fn().mockResolvedValue(mockSubscription);
    const origSW = navigator.serviceWorker;

    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        ready: Promise.resolve({
          pushManager: { getSubscription: mockGetSubscription },
        }),
      },
      configurable: true,
      writable: true,
    });

    const mockFetchLocal = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetchLocal);

    const result = await unsubscribeFromPush();
    expect(result).toBe(true);
    expect(mockUnsubscribe).toHaveBeenCalled();
    expect(mockFetchLocal).toHaveBeenCalledWith(
      "/api/push/subscribe",
      expect.objectContaining({ method: "DELETE" })
    );

    Object.defineProperty(navigator, "serviceWorker", {
      value: origSW,
      configurable: true,
      writable: true,
    });
    vi.unstubAllGlobals();
  });

  it("returns false when unsubscribe throws", async () => {
    const origSW = navigator.serviceWorker;

    Object.defineProperty(navigator, "serviceWorker", {
      value: {
        ready: Promise.reject(new Error("SW error")),
      },
      configurable: true,
      writable: true,
    });

    const result = await unsubscribeFromPush();
    expect(result).toBe(false);

    Object.defineProperty(navigator, "serviceWorker", {
      value: origSW,
      configurable: true,
      writable: true,
    });
  });
});
