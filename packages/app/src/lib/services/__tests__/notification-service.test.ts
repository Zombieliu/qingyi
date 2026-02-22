import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();
const mockFindUnique = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    notification: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

vi.mock("@/lib/realtime", () => ({
  publishNotificationEvent: vi.fn().mockResolvedValue(undefined),
}));

import {
  createNotification,
  getUnreadNotifications,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  notifyOrderStatusChange,
  notifyCompanionNewOrder,
  notifyReferralReward,
  notifyLevelUp,
} from "@/lib/services/notification-service";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createNotification", () => {
  it("creates notification and publishes SSE event", async () => {
    const row = {
      id: "NTF-1",
      userAddress: "0xabc",
      type: "system",
      title: "Test",
      body: "Hello",
      orderId: null,
      read: false,
      createdAt: new Date(),
    };
    mockCreate.mockResolvedValue(row);

    const result = await createNotification({
      userAddress: "0xabc",
      type: "system",
      title: "Test",
      body: "Hello",
    });

    expect(result).not.toBeNull();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const { publishNotificationEvent } = await import("@/lib/realtime");
    expect(publishNotificationEvent).toHaveBeenCalledWith(
      "0xabc",
      expect.objectContaining({ type: "notification", title: "Test" })
    );
  });

  it("returns null for empty userAddress", async () => {
    const result = await createNotification({
      userAddress: "",
      type: "system",
      title: "Test",
      body: "Hello",
    });
    expect(result).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("getUnreadNotifications", () => {
  it("queries unread notifications", async () => {
    mockFindMany.mockResolvedValue([]);
    await getUnreadNotifications("0xabc");
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userAddress: "0xabc", read: false },
      })
    );
  });
});

describe("getNotifications", () => {
  it("returns paginated results", async () => {
    mockCount.mockResolvedValue(25);
    mockFindMany.mockResolvedValue([]);

    const result = await getNotifications("0xabc", 2, 10);

    expect(result.total).toBe(25);
    expect(result.page).toBe(2);
    expect(result.totalPages).toBe(3);
  });
});

describe("getUnreadCount", () => {
  it("returns count of unread notifications", async () => {
    mockCount.mockResolvedValue(5);
    const count = await getUnreadCount("0xabc");
    expect(count).toBe(5);
  });
});

describe("markAsRead", () => {
  it("marks a notification as read", async () => {
    mockUpdate.mockResolvedValue({ id: "NTF-1", read: true });
    const result = await markAsRead("NTF-1", "0xabc");
    expect(result).not.toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "NTF-1" } }));
  });

  it("returns null on error", async () => {
    mockUpdate.mockRejectedValue(new Error("not found"));
    const result = await markAsRead("NTF-999", "0xabc");
    expect(result).toBeNull();
  });
});

describe("markAllAsRead", () => {
  it("marks all unread as read", async () => {
    mockUpdateMany.mockResolvedValue({ count: 3 });
    const count = await markAllAsRead("0xabc");
    expect(count).toBe(3);
  });
});

describe("convenience methods", () => {
  beforeEach(() => {
    mockCreate.mockResolvedValue({
      id: "NTF-1",
      userAddress: "0xabc",
      type: "order_status",
      title: "t",
      body: "b",
      orderId: null,
      read: false,
      createdAt: new Date(),
    });
  });

  it("notifyOrderStatusChange creates order_status notification", async () => {
    await notifyOrderStatusChange({
      userAddress: "0xabc",
      orderId: "ORD-1",
      stage: "已完成",
      item: "三角洲陪玩",
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "order_status" }),
      })
    );
  });

  it("notifyCompanionNewOrder creates notification for companion", async () => {
    await notifyCompanionNewOrder({
      companionAddress: "0xcomp",
      orderId: "ORD-1",
      item: "三角洲陪玩",
      amount: 88,
    });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userAddress: "0xcomp",
          type: "order_status",
        }),
      })
    );
  });

  it("notifyReferralReward creates referral notification", async () => {
    await notifyReferralReward({ userAddress: "0xabc", reward: 50 });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "referral" }),
      })
    );
  });

  it("notifyLevelUp creates growth notification", async () => {
    await notifyLevelUp({ userAddress: "0xabc", tierName: "黄金", level: 2 });
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: "growth" }),
      })
    );
  });
});
