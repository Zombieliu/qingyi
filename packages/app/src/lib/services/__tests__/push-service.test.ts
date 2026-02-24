import { describe, it, expect, vi, beforeEach } from "vitest";

// Must set env before module evaluation (module reads env at top level)
vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public-key";
  process.env.VAPID_PRIVATE_KEY = "test-private-key";
});

const mockSetCache = vi.fn();
const mockGetCache = vi.fn();
const mockSendNotification = vi.fn();

vi.mock("@/lib/server-cache", () => ({
  setCache: (...args: unknown[]) => mockSetCache(...args),
  getCache: (...args: unknown[]) => mockGetCache(...args),
}));

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: (...args: unknown[]) => mockSendNotification(...args),
  },
}));

import {
  savePushSubscription,
  removePushSubscription,
  getPushSubscription,
  sendPushNotification,
} from "@/lib/services/push-service";

beforeEach(() => {
  vi.clearAllMocks();
});

const testSub = {
  endpoint: "https://push.example.com/sub1",
  keys: { p256dh: "p256dh-key", auth: "auth-key" },
};

describe("savePushSubscription", () => {
  it("stores subscription in cache with 30-day TTL", async () => {
    await savePushSubscription("0xabc", testSub);

    expect(mockSetCache).toHaveBeenCalledWith(
      "push:sub:0xabc",
      expect.stringContaining("0xabc"),
      30 * 86400_000
    );
  });
});

describe("removePushSubscription", () => {
  it("logs the removal", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    await removePushSubscription("https://push.example.com/sub1");

    expect(spy).toHaveBeenCalledWith(expect.stringContaining("push_unsubscribe"));
    spy.mockRestore();
  });
});

describe("getPushSubscription", () => {
  it("returns parsed subscription from cache", async () => {
    const stored = { userAddress: "0xabc", subscription: testSub, createdAt: 1000 };
    mockGetCache.mockReturnValue({ value: JSON.stringify(stored) });

    const result = await getPushSubscription("0xabc");

    expect(result).toEqual(stored);
  });

  it("returns null when no cache entry", async () => {
    mockGetCache.mockReturnValue(null);

    const result = await getPushSubscription("0xabc");

    expect(result).toBeNull();
  });

  it("returns null when cache value is invalid JSON", async () => {
    mockGetCache.mockReturnValue({ value: "not-json{{{" });

    const result = await getPushSubscription("0xabc");

    expect(result).toBeNull();
  });
});

describe("sendPushNotification", () => {
  it("sends notification and returns true on success", async () => {
    const stored = { userAddress: "0xabc", subscription: testSub, createdAt: 1000 };
    mockGetCache.mockReturnValue({ value: JSON.stringify(stored) });
    mockSendNotification.mockResolvedValue({});

    const result = await sendPushNotification("0xabc", {
      title: "Test",
      body: "Hello",
    });

    expect(result).toBe(true);
    expect(mockSendNotification).toHaveBeenCalledWith(
      { endpoint: testSub.endpoint, keys: testSub.keys },
      expect.stringContaining("Test"),
      { TTL: 3600 }
    );
  });

  it("returns false when no subscription found", async () => {
    mockGetCache.mockReturnValue(null);

    const result = await sendPushNotification("0xabc", {
      title: "Test",
      body: "Hello",
    });

    expect(result).toBe(false);
    expect(mockSendNotification).not.toHaveBeenCalled();
  });

  it("returns false and logs on send failure", async () => {
    const stored = { userAddress: "0xabc", subscription: testSub, createdAt: 1000 };
    mockGetCache.mockReturnValue({ value: JSON.stringify(stored) });
    mockSendNotification.mockRejectedValue(new Error("network error"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await sendPushNotification("0xabc", {
      title: "Test",
      body: "Hello",
    });

    expect(result).toBe(false);
    vi.restoreAllMocks();
  });
});
