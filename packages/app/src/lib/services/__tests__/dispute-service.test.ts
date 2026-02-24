import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
const mockUpdate = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    adminOrder: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

vi.mock("@/lib/feature-flags", () => ({
  isFeatureEnabled: vi.fn().mockReturnValue(true),
}));

vi.mock("@/lib/services/notification-service", () => ({
  notifyOrderStatusChange: vi.fn().mockResolvedValue(undefined),
}));

import {
  createDispute,
  resolveDispute,
  getDispute,
  listUserDisputes,
} from "@/lib/services/dispute-service";
import { isFeatureEnabled } from "@/lib/feature-flags";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isFeatureEnabled).mockReturnValue(true);
});

const baseOrder = {
  id: "ORD-1",
  userAddress: "0xuser",
  companionAddress: "0xcomp",
  stage: "已完成",
  item: "三角洲陪玩",
  amount: "100",
  meta: {},
  paymentStatus: "已支付",
};

describe("createDispute", () => {
  it("creates a dispute for a valid order", async () => {
    mockFindUnique.mockResolvedValue(baseOrder);
    mockUpdate.mockResolvedValue({});

    const result = await createDispute({
      orderId: "ORD-1",
      userAddress: "0xuser",
      reason: "service_quality",
      description: "服务质量差",
    });

    expect(result.orderId).toBe("ORD-1");
    expect(result.status).toBe("pending");
    expect(result.reason).toBe("service_quality");
    expect(mockUpdate).toHaveBeenCalledTimes(2); // stage update + meta update
  });

  it("throws when feature flag is disabled", async () => {
    vi.mocked(isFeatureEnabled).mockReturnValue(false);

    await expect(
      createDispute({
        orderId: "ORD-1",
        userAddress: "0xuser",
        reason: "no_show",
        description: "未到",
      })
    ).rejects.toThrow("争议功能暂未开放");
  });

  it("throws when order does not exist", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(
      createDispute({
        orderId: "ORD-999",
        userAddress: "0xuser",
        reason: "no_show",
        description: "未到",
      })
    ).rejects.toThrow("订单不存在");
  });

  it("throws when user does not own the order", async () => {
    mockFindUnique.mockResolvedValue({ ...baseOrder, userAddress: "0xother" });

    await expect(
      createDispute({
        orderId: "ORD-1",
        userAddress: "0xuser",
        reason: "no_show",
        description: "未到",
      })
    ).rejects.toThrow("无权操作此订单");
  });

  it("throws when order stage is not eligible", async () => {
    mockFindUnique.mockResolvedValue({ ...baseOrder, stage: "已取消" });

    await expect(
      createDispute({
        orderId: "ORD-1",
        userAddress: "0xuser",
        reason: "overcharge",
        description: "多收费",
      })
    ).rejects.toThrow("当前订单状态不支持发起争议");
  });

  it("allows dispute for 进行中 orders", async () => {
    mockFindUnique.mockResolvedValue({ ...baseOrder, stage: "进行中" });
    mockUpdate.mockResolvedValue({});

    const result = await createDispute({
      orderId: "ORD-1",
      userAddress: "0xuser",
      reason: "wrong_service",
      description: "服务不符",
    });

    expect(result.status).toBe("pending");
  });

  it("creates dispute with evidence", async () => {
    mockFindUnique.mockResolvedValue(baseOrder);
    mockUpdate.mockResolvedValue({});

    const result = await createDispute({
      orderId: "ORD-1",
      userAddress: "0xuser",
      reason: "service_quality",
      description: "差",
      evidence: ["https://img1.png", "https://img2.png"],
    });

    expect(result.evidence).toEqual(["https://img1.png", "https://img2.png"]);
  });

  it("creates dispute when companion address is null", async () => {
    mockFindUnique.mockResolvedValue({ ...baseOrder, companionAddress: null });
    mockUpdate.mockResolvedValue({});

    const result = await createDispute({
      orderId: "ORD-1",
      userAddress: "0xuser",
      reason: "no_show",
      description: "未到",
    });

    expect(result.status).toBe("pending");
  });
});

describe("resolveDispute", () => {
  const orderWithDispute = {
    ...baseOrder,
    stage: "争议中",
    meta: {
      dispute: {
        id: "DSP-1",
        orderId: "ORD-1",
        userAddress: "0xuser",
        reason: "service_quality",
        description: "差",
        status: "pending",
        createdAt: new Date(),
      },
    },
  };

  it("resolves dispute with refund", async () => {
    mockFindUnique.mockResolvedValue(orderWithDispute);
    mockUpdate.mockResolvedValue({});

    const result = await resolveDispute({
      orderId: "ORD-1",
      resolution: "refund",
      note: "全额退款",
    });

    expect(result.status).toBe("resolved_refund");
    expect(result.refundAmount).toBe(100);
    expect(result.resolution).toBe("全额退款");
  });

  it("resolves dispute with reject (refundAmount = 0)", async () => {
    mockFindUnique.mockResolvedValue(orderWithDispute);
    mockUpdate.mockResolvedValue({});

    const result = await resolveDispute({
      orderId: "ORD-1",
      resolution: "reject",
    });

    expect(result.status).toBe("resolved_reject");
    expect(result.refundAmount).toBe(0);
  });

  it("resolves dispute with partial refund", async () => {
    mockFindUnique.mockResolvedValue(orderWithDispute);
    mockUpdate.mockResolvedValue({});

    const result = await resolveDispute({
      orderId: "ORD-1",
      resolution: "partial",
      refundAmount: 50,
    });

    expect(result.status).toBe("resolved_partial");
    expect(result.refundAmount).toBe(50);
  });

  it("throws when order has no dispute", async () => {
    mockFindUnique.mockResolvedValue(baseOrder);

    await expect(resolveDispute({ orderId: "ORD-1", resolution: "refund" })).rejects.toThrow(
      "该订单没有争议记录"
    );
  });

  it("throws when order not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    await expect(resolveDispute({ orderId: "ORD-999", resolution: "refund" })).rejects.toThrow(
      "订单不存在"
    );
  });

  it("resolves dispute with reviewerRole", async () => {
    mockFindUnique.mockResolvedValue(orderWithDispute);
    mockUpdate.mockResolvedValue({});

    const result = await resolveDispute({
      orderId: "ORD-1",
      resolution: "refund",
      note: "全额退款",
      reviewerRole: "admin",
    });

    expect(result.reviewerRole).toBe("admin");
  });

  it("resolves partial without explicit refundAmount (uses order amount)", async () => {
    mockFindUnique.mockResolvedValue(orderWithDispute);
    mockUpdate.mockResolvedValue({});

    const result = await resolveDispute({
      orderId: "ORD-1",
      resolution: "partial",
    });

    expect(result.status).toBe("resolved_partial");
    expect(result.refundAmount).toBe(100); // falls back to order.amount
  });

  it("sets stage to 已完成 when reject", async () => {
    mockFindUnique.mockResolvedValue(orderWithDispute);
    mockUpdate.mockResolvedValue({});

    await resolveDispute({
      orderId: "ORD-1",
      resolution: "reject",
    });

    // Verify the update was called with stage: "已完成"
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: "已完成" }),
      })
    );
  });

  it("sets stage to 已退款 when refund", async () => {
    mockFindUnique.mockResolvedValue(orderWithDispute);
    mockUpdate.mockResolvedValue({});

    await resolveDispute({
      orderId: "ORD-1",
      resolution: "refund",
    });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: "已退款" }),
      })
    );
  });
});

describe("getDispute", () => {
  it("returns dispute from order meta", async () => {
    const dispute = { id: "DSP-1", status: "pending" };
    mockFindUnique.mockResolvedValue({ ...baseOrder, meta: { dispute } });

    const result = await getDispute("ORD-1");

    expect(result).toEqual(dispute);
  });

  it("returns null when order not found", async () => {
    mockFindUnique.mockResolvedValue(null);

    const result = await getDispute("ORD-999");

    expect(result).toBeNull();
  });

  it("returns null when order has no dispute in meta", async () => {
    mockFindUnique.mockResolvedValue({ ...baseOrder, meta: {} });

    const result = await getDispute("ORD-1");

    expect(result).toBeNull();
  });

  it("returns null when meta is null", async () => {
    mockFindUnique.mockResolvedValue({ ...baseOrder, meta: null });

    const result = await getDispute("ORD-1");

    expect(result).toBeNull();
  });
});

describe("listUserDisputes", () => {
  it("returns disputes from user orders", async () => {
    const dispute = { id: "DSP-1", status: "pending" };
    mockFindMany.mockResolvedValue([
      { ...baseOrder, meta: { dispute } },
      { ...baseOrder, id: "ORD-2", meta: {} },
    ]);

    const result = await listUserDisputes("0xuser");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(dispute);
  });

  it("returns empty array when no disputes", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await listUserDisputes("0xuser");

    expect(result).toHaveLength(0);
  });
});
