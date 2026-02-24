import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();
const mockFindUnique = vi.fn();
const mockDeleteMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    notification: {
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
    },
  },
}));

vi.mock("@/lib/realtime", () => ({
  publishNotificationEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock push-service module
vi.mock("@/lib/services/push-service", () => ({
  sendPushNotification: vi.fn().mockResolvedValue(undefined),
}));

// Mock kook-service module
vi.mock("@/lib/services/kook-service", () => ({
  isKookEnabled: vi.fn().mockReturnValue(true),
  notifyKookOrderStatus: vi.fn().mockResolvedValue(undefined),
}));

import {
  createNotification,
  getUnreadNotifications,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  deleteAllNotifications,
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
    const result = await markAsRead("NTF-1");
    expect(result).not.toBeNull();
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "NTF-1" } }));
  });

  it("returns null on error", async () => {
    mockUpdate.mockRejectedValue(new Error("not found"));
    const result = await markAsRead("NTF-999");
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

describe("deleteAllNotifications", () => {
  it("deletes all notifications for a user", async () => {
    mockDeleteMany.mockResolvedValue({ count: 5 });
    const count = await deleteAllNotifications("0xabc");
    expect(count).toBe(5);
    expect(mockDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userAddress: "0xabc" } })
    );
  });
});

describe("createNotification with push service", () => {
  it("fires push notification import (non-blocking)", async () => {
    const row = {
      id: "NTF-2",
      userAddress: "0xdef",
      type: "system",
      title: "Push Test",
      body: "Testing push",
      orderId: "ORD-1",
      read: false,
      createdAt: new Date(),
    };
    mockCreate.mockResolvedValue(row);

    const result = await createNotification({
      userAddress: "0xdef",
      type: "system",
      title: "Push Test",
      body: "Testing push",
      orderId: "ORD-1",
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe("NTF-2");
  });
});

describe("notifyOrderStatusChange with kook", () => {
  it("fires kook notification import (non-blocking)", async () => {
    mockCreate.mockResolvedValue({
      id: "NTF-3",
      userAddress: "0xabc",
      type: "order_status",
      title: "t",
      body: "b",
      orderId: "ORD-2",
      read: false,
      createdAt: new Date(),
    });

    const result = await notifyOrderStatusChange({
      userAddress: "0xabc",
      orderId: "ORD-2",
      stage: "已支付",
      item: "三角洲陪玩",
    });

    expect(result).not.toBeNull();
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "order_status",
          orderId: "ORD-2",
        }),
      })
    );
  });
});

describe("createNotification SSE failure handling", () => {
  it("still returns notification when SSE publish fails", async () => {
    const { publishNotificationEvent } = await import("@/lib/realtime");
    (publishNotificationEvent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("SSE down")
    );

    const row = {
      id: "NTF-SSE-FAIL",
      userAddress: "0xfail",
      type: "system",
      title: "SSE Fail Test",
      body: "Testing SSE failure",
      orderId: null,
      read: false,
      createdAt: new Date(),
    };
    mockCreate.mockResolvedValue(row);

    const result = await createNotification({
      userAddress: "0xfail",
      type: "system",
      title: "SSE Fail Test",
      body: "Testing SSE failure",
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBe("NTF-SSE-FAIL");
  });
});

describe("createNotification push notification paths", () => {
  it("sends push notification with orderId URL", async () => {
    const { sendPushNotification } = await import("@/lib/services/push-service");
    (sendPushNotification as ReturnType<typeof vi.fn>).mockClear();

    const row = {
      id: "NTF-PUSH-1",
      userAddress: "0xpush",
      type: "system",
      title: "Push with order",
      body: "Has orderId",
      orderId: "ORD-PUSH",
      read: false,
      createdAt: new Date(),
    };
    mockCreate.mockResolvedValue(row);

    const result = await createNotification({
      userAddress: "0xpush",
      type: "system",
      title: "Push with order",
      body: "Has orderId",
      orderId: "ORD-PUSH",
    });

    expect(result).not.toBeNull();
    // Wait for async import to resolve
    await new Promise((r) => setTimeout(r, 50));
    expect(sendPushNotification).toHaveBeenCalledWith(
      "0xpush",
      expect.objectContaining({
        url: "/me/orders/ORD-PUSH",
      })
    );
  });

  it("sends push notification with notifications URL when no orderId", async () => {
    const { sendPushNotification } = await import("@/lib/services/push-service");
    (sendPushNotification as ReturnType<typeof vi.fn>).mockClear();

    const row = {
      id: "NTF-PUSH-2",
      userAddress: "0xpush2",
      type: "system",
      title: "Push no order",
      body: "No orderId",
      orderId: null,
      read: false,
      createdAt: new Date(),
    };
    mockCreate.mockResolvedValue(row);

    const result = await createNotification({
      userAddress: "0xpush2",
      type: "system",
      title: "Push no order",
      body: "No orderId",
    });

    expect(result).not.toBeNull();
    await new Promise((r) => setTimeout(r, 50));
    expect(sendPushNotification).toHaveBeenCalledWith(
      "0xpush2",
      expect.objectContaining({
        url: "/me/notifications",
      })
    );
  });
});

describe("createNotification push failure catch", () => {
  it("handles push notification sendPushNotification rejection gracefully", async () => {
    const { sendPushNotification } = await import("@/lib/services/push-service");
    (sendPushNotification as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("push failed")
    );

    const row = {
      id: "NTF-PUSH-FAIL",
      userAddress: "0xpushfail",
      type: "system",
      title: "Push Fail",
      body: "Testing push failure",
      orderId: null,
      read: false,
      createdAt: new Date(),
    };
    mockCreate.mockResolvedValue(row);

    const result = await createNotification({
      userAddress: "0xpushfail",
      type: "system",
      title: "Push Fail",
      body: "Testing push failure",
    });

    // Should still return the notification despite push failure
    expect(result).not.toBeNull();
    expect(result!.id).toBe("NTF-PUSH-FAIL");

    // Wait for async catch to fire
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe("notifyOrderStatusChange kook failure catch", () => {
  it("handles kook isKookEnabled throwing gracefully", async () => {
    const { isKookEnabled } = await import("@/lib/services/kook-service");
    (isKookEnabled as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      throw new Error("kook check failed");
    });

    mockCreate.mockResolvedValue({
      id: "NTF-KOOK-FAIL",
      userAddress: "0xkookfail",
      type: "order_status",
      title: "t",
      body: "b",
      orderId: "ORD-KFAIL",
      read: false,
      createdAt: new Date(),
    });

    const result = await notifyOrderStatusChange({
      userAddress: "0xkookfail",
      orderId: "ORD-KFAIL",
      stage: "已完成",
      item: "陪玩",
    });

    expect(result).not.toBeNull();
    // Wait for async catch to fire
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe("notifyOrderStatusChange kook integration", () => {
  it("calls kook notification when enabled", async () => {
    mockCreate.mockResolvedValue({
      id: "NTF-KOOK",
      userAddress: "0xkook",
      type: "order_status",
      title: "t",
      body: "b",
      orderId: "ORD-KOOK",
      read: false,
      createdAt: new Date(),
    });

    await notifyOrderStatusChange({
      userAddress: "0xkook",
      orderId: "ORD-KOOK",
      stage: "进行中",
      item: "陪玩服务",
    });

    // Wait for async import to resolve
    await new Promise((r) => setTimeout(r, 10));
    const { notifyKookOrderStatus } = await import("@/lib/services/kook-service");
    expect(notifyKookOrderStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        orderId: "ORD-KOOK",
        stage: "进行中",
      })
    );
  });

  it("uses stage label for unknown stage", async () => {
    mockCreate.mockResolvedValue({
      id: "NTF-UNKNOWN",
      userAddress: "0xunk",
      type: "order_status",
      title: "t",
      body: "b",
      orderId: "ORD-UNK",
      read: false,
      createdAt: new Date(),
    });

    await notifyOrderStatusChange({
      userAddress: "0xunk",
      orderId: "ORD-UNK",
      stage: "自定义状态",
      item: "陪玩",
    });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          body: expect.stringContaining("自定义状态"),
        }),
      })
    );
  });
});
