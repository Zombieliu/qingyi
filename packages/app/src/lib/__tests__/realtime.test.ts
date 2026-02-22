import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSet, mockGet } = vi.hoisted(() => ({
  mockSet: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    UPSTASH_REDIS_REST_URL: "https://fake.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "fake-token",
  },
}));

vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({ set: mockSet, get: mockGet }),
  },
}));

import {
  publishOrderEvent,
  getLatestEvent,
  publishNotificationEvent,
  getLatestNotificationEvent,
  type OrderEvent,
  type NotificationEvent,
} from "../realtime";

beforeEach(() => {
  mockSet.mockReset();
  mockGet.mockReset();
});

describe("publishOrderEvent", () => {
  it("writes event to Redis with TTL", async () => {
    mockSet.mockResolvedValue("OK");
    const event: OrderEvent = {
      type: "status_change",
      orderId: "ORD-1",
      stage: "已确认",
      timestamp: 1000,
    };
    await publishOrderEvent("0xabc", event);
    expect(mockSet).toHaveBeenCalledWith("rt:order:0xabc", JSON.stringify(event), { ex: 300 });
  });

  it("does nothing if userAddress is empty", async () => {
    await publishOrderEvent("", { type: "completed", orderId: "ORD-2", timestamp: 2000 });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("silently fails on Redis error", async () => {
    mockSet.mockRejectedValue(new Error("connection refused"));
    await expect(
      publishOrderEvent("0xabc", { type: "cancelled", orderId: "ORD-3", timestamp: 3000 })
    ).resolves.toBeUndefined();
  });
});

describe("getLatestEvent", () => {
  it("returns parsed event from Redis", async () => {
    const event: OrderEvent = { type: "assigned", orderId: "ORD-4", timestamp: 4000 };
    mockGet.mockResolvedValue(JSON.stringify(event));
    const result = await getLatestEvent("0xdef");
    expect(result).toEqual(event);
  });

  it("returns null if no event", async () => {
    mockGet.mockResolvedValue(null);
    const result = await getLatestEvent("0xdef");
    expect(result).toBeNull();
  });

  it("returns null for empty address", async () => {
    const result = await getLatestEvent("");
    expect(result).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("returns null on Redis error", async () => {
    mockGet.mockRejectedValue(new Error("timeout"));
    const result = await getLatestEvent("0xabc");
    expect(result).toBeNull();
  });

  it("handles pre-parsed object from Redis", async () => {
    const event: OrderEvent = { type: "deposit_paid", orderId: "ORD-5", timestamp: 5000 };
    mockGet.mockResolvedValue(event);
    const result = await getLatestEvent("0xghi");
    expect(result).toEqual(event);
  });
});

describe("publishNotificationEvent", () => {
  it("writes notification event to Redis", async () => {
    mockSet.mockResolvedValue("OK");
    const event: NotificationEvent = {
      type: "notification",
      id: "NTF-1",
      title: "Test",
      body: "Hello",
      notifType: "system",
      timestamp: 6000,
    };
    await publishNotificationEvent("0xabc", event);
    expect(mockSet).toHaveBeenCalledWith("rt:notif:0xabc", JSON.stringify(event), { ex: 300 });
  });

  it("does nothing for empty address", async () => {
    await publishNotificationEvent("", {
      type: "notification",
      id: "NTF-2",
      title: "T",
      body: "B",
      notifType: "system",
      timestamp: 7000,
    });
    expect(mockSet).not.toHaveBeenCalled();
  });

  it("silently fails on Redis error", async () => {
    mockSet.mockRejectedValue(new Error("fail"));
    await expect(
      publishNotificationEvent("0xabc", {
        type: "notification",
        id: "NTF-3",
        title: "T",
        body: "B",
        notifType: "system",
        timestamp: 8000,
      })
    ).resolves.toBeUndefined();
  });
});

describe("getLatestNotificationEvent", () => {
  it("returns parsed notification event", async () => {
    const event: NotificationEvent = {
      type: "notification",
      id: "NTF-4",
      title: "Level Up",
      body: "Congrats",
      notifType: "growth",
      timestamp: 9000,
    };
    mockGet.mockResolvedValue(JSON.stringify(event));
    const result = await getLatestNotificationEvent("0xabc");
    expect(result).toEqual(event);
  });

  it("returns null if no event", async () => {
    mockGet.mockResolvedValue(null);
    const result = await getLatestNotificationEvent("0xabc");
    expect(result).toBeNull();
  });

  it("returns null for empty address", async () => {
    const result = await getLatestNotificationEvent("");
    expect(result).toBeNull();
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("returns null on Redis error", async () => {
    mockGet.mockRejectedValue(new Error("timeout"));
    const result = await getLatestNotificationEvent("0xabc");
    expect(result).toBeNull();
  });
});
