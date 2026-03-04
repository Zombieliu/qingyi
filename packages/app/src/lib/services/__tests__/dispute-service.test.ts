import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockOrderFindUnique,
  mockOrderUpdate,
  mockOrderFindMany,
  mockDisputeFindUnique,
  mockDisputeCreate,
  mockDisputeUpsert,
  mockDisputeFindMany,
  mockPrisma,
} = vi.hoisted(() => {
  const mockOrderFindUnique = vi.fn();
  const mockOrderUpdate = vi.fn();
  const mockOrderFindMany = vi.fn();

  const mockDisputeFindUnique = vi.fn();
  const mockDisputeCreate = vi.fn();
  const mockDisputeUpsert = vi.fn();
  const mockDisputeFindMany = vi.fn();

  const tx = {
    adminOrder: {
      update: (...args: unknown[]) => mockOrderUpdate(...args),
    },
    dispute: {
      create: (...args: unknown[]) => mockDisputeCreate(...args),
      upsert: (...args: unknown[]) => mockDisputeUpsert(...args),
    },
  };

  const mockPrisma: Record<string, unknown> = {
    adminOrder: {
      findUnique: (...args: unknown[]) => mockOrderFindUnique(...args),
      update: (...args: unknown[]) => mockOrderUpdate(...args),
      findMany: (...args: unknown[]) => mockOrderFindMany(...args),
    },
    dispute: {
      findUnique: (...args: unknown[]) => mockDisputeFindUnique(...args),
      findMany: (...args: unknown[]) => mockDisputeFindMany(...args),
      create: (...args: unknown[]) => mockDisputeCreate(...args),
      upsert: (...args: unknown[]) => mockDisputeUpsert(...args),
    },
    $transaction: vi.fn(async (fn: (ctx: unknown) => Promise<unknown>) => fn(tx)),
  };

  return {
    mockOrderFindUnique,
    mockOrderUpdate,
    mockOrderFindMany,
    mockDisputeFindUnique,
    mockDisputeCreate,
    mockDisputeUpsert,
    mockDisputeFindMany,
    mockPrisma,
  };
});

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
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

const tableDispute = {
  id: "DSP-1",
  orderId: "ORD-1",
  userAddress: "0xuser",
  reason: "service_quality",
  description: "差",
  evidence: null,
  status: "pending",
  resolution: null,
  refundAmount: null,
  reviewerRole: null,
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  updatedAt: new Date("2026-03-01T00:00:00.000Z"),
  resolvedAt: null,
};

describe("createDispute", () => {
  it("creates a dispute for a valid order", async () => {
    mockOrderFindUnique.mockResolvedValue(baseOrder);
    mockDisputeFindUnique.mockResolvedValue(null);
    mockDisputeCreate.mockResolvedValue(tableDispute);
    mockOrderUpdate.mockResolvedValue({});

    const result = await createDispute({
      orderId: "ORD-1",
      userAddress: "0xuser",
      reason: "service_quality",
      description: "服务质量差",
    });

    expect(result.orderId).toBe("ORD-1");
    expect(result.status).toBe("pending");
    expect(result.reason).toBe("service_quality");
    expect(mockDisputeCreate).toHaveBeenCalledTimes(1);
    expect(mockOrderUpdate).toHaveBeenCalledTimes(1);
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
    mockOrderFindUnique.mockResolvedValue(null);
    mockDisputeFindUnique.mockResolvedValue(null);

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
    mockOrderFindUnique.mockResolvedValue({ ...baseOrder, userAddress: "0xother" });
    mockDisputeFindUnique.mockResolvedValue(null);

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
    mockOrderFindUnique.mockResolvedValue({ ...baseOrder, stage: "已取消" });
    mockDisputeFindUnique.mockResolvedValue(null);

    await expect(
      createDispute({
        orderId: "ORD-1",
        userAddress: "0xuser",
        reason: "overcharge",
        description: "多收费",
      })
    ).rejects.toThrow("当前订单状态不支持发起争议");
  });

  it("throws when dispute already exists", async () => {
    mockOrderFindUnique.mockResolvedValue(baseOrder);
    mockDisputeFindUnique.mockResolvedValue(tableDispute);

    await expect(
      createDispute({
        orderId: "ORD-1",
        userAddress: "0xuser",
        reason: "service_quality",
        description: "重复提交",
      })
    ).rejects.toThrow("该订单已存在争议记录");
  });

  it("allows dispute for 进行中 orders", async () => {
    mockOrderFindUnique.mockResolvedValue({ ...baseOrder, stage: "进行中" });
    mockDisputeFindUnique.mockResolvedValue(null);
    mockDisputeCreate.mockResolvedValue(tableDispute);
    mockOrderUpdate.mockResolvedValue({});

    const result = await createDispute({
      orderId: "ORD-1",
      userAddress: "0xuser",
      reason: "wrong_service",
      description: "服务不符",
    });

    expect(result.status).toBe("pending");
  });

  it("creates dispute with evidence", async () => {
    mockOrderFindUnique.mockResolvedValue(baseOrder);
    mockDisputeFindUnique.mockResolvedValue(null);
    mockDisputeCreate.mockResolvedValue(tableDispute);
    mockOrderUpdate.mockResolvedValue({});

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
    mockOrderFindUnique.mockResolvedValue({ ...baseOrder, companionAddress: null });
    mockDisputeFindUnique.mockResolvedValue(null);
    mockDisputeCreate.mockResolvedValue(tableDispute);
    mockOrderUpdate.mockResolvedValue({});

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
  it("resolves dispute with refund", async () => {
    mockOrderFindUnique.mockResolvedValue(baseOrder);
    mockDisputeFindUnique.mockResolvedValue(tableDispute);
    mockDisputeUpsert.mockResolvedValue({ ...tableDispute, status: "resolved_refund" });
    mockOrderUpdate.mockResolvedValue({});

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
    mockOrderFindUnique.mockResolvedValue(baseOrder);
    mockDisputeFindUnique.mockResolvedValue(tableDispute);
    mockDisputeUpsert.mockResolvedValue({ ...tableDispute, status: "resolved_reject" });
    mockOrderUpdate.mockResolvedValue({});

    const result = await resolveDispute({
      orderId: "ORD-1",
      resolution: "reject",
    });

    expect(result.status).toBe("resolved_reject");
    expect(result.refundAmount).toBe(0);
  });

  it("resolves dispute with partial refund", async () => {
    mockOrderFindUnique.mockResolvedValue(baseOrder);
    mockDisputeFindUnique.mockResolvedValue(tableDispute);
    mockDisputeUpsert.mockResolvedValue({ ...tableDispute, status: "resolved_partial" });
    mockOrderUpdate.mockResolvedValue({});

    const result = await resolveDispute({
      orderId: "ORD-1",
      resolution: "partial",
      refundAmount: 50,
    });

    expect(result.status).toBe("resolved_partial");
    expect(result.refundAmount).toBe(50);
  });

  it("falls back to legacy meta dispute when table record is missing", async () => {
    mockOrderFindUnique.mockResolvedValue({
      ...baseOrder,
      meta: {
        dispute: {
          id: "DSP-legacy",
          orderId: "ORD-1",
          userAddress: "0xuser",
          reason: "service_quality",
          description: "legacy",
          status: "pending",
          createdAt: new Date().toISOString(),
        },
      },
    });
    mockDisputeFindUnique.mockResolvedValue(null);
    mockDisputeUpsert.mockResolvedValue({
      ...tableDispute,
      id: "DSP-legacy",
      status: "resolved_refund",
    });
    mockOrderUpdate.mockResolvedValue({});

    const result = await resolveDispute({
      orderId: "ORD-1",
      resolution: "refund",
    });

    expect(result.status).toBe("resolved_refund");
  });

  it("throws when order has no dispute", async () => {
    mockOrderFindUnique.mockResolvedValue(baseOrder);
    mockDisputeFindUnique.mockResolvedValue(null);

    await expect(resolveDispute({ orderId: "ORD-1", resolution: "refund" })).rejects.toThrow(
      "该订单没有争议记录"
    );
  });

  it("throws when order not found", async () => {
    mockOrderFindUnique.mockResolvedValue(null);

    await expect(resolveDispute({ orderId: "ORD-999", resolution: "refund" })).rejects.toThrow(
      "订单不存在"
    );
  });

  it("resolves dispute with reviewerRole", async () => {
    mockOrderFindUnique.mockResolvedValue(baseOrder);
    mockDisputeFindUnique.mockResolvedValue(tableDispute);
    mockDisputeUpsert.mockResolvedValue({ ...tableDispute, status: "resolved_refund" });
    mockOrderUpdate.mockResolvedValue({});

    const result = await resolveDispute({
      orderId: "ORD-1",
      resolution: "refund",
      note: "全额退款",
      reviewerRole: "admin",
    });

    expect(result.reviewerRole).toBe("admin");
  });

  it("resolves partial without explicit refundAmount (uses order amount)", async () => {
    mockOrderFindUnique.mockResolvedValue(baseOrder);
    mockDisputeFindUnique.mockResolvedValue(tableDispute);
    mockDisputeUpsert.mockResolvedValue({ ...tableDispute, status: "resolved_partial" });
    mockOrderUpdate.mockResolvedValue({});

    const result = await resolveDispute({
      orderId: "ORD-1",
      resolution: "partial",
    });

    expect(result.status).toBe("resolved_partial");
    expect(result.refundAmount).toBe(100); // falls back to order.amount
  });

  it("sets stage to 已完成 when reject", async () => {
    mockOrderFindUnique.mockResolvedValue(baseOrder);
    mockDisputeFindUnique.mockResolvedValue(tableDispute);
    mockDisputeUpsert.mockResolvedValue({ ...tableDispute, status: "resolved_reject" });
    mockOrderUpdate.mockResolvedValue({});

    await resolveDispute({
      orderId: "ORD-1",
      resolution: "reject",
    });

    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: "已完成" }),
      })
    );
  });

  it("sets stage to 已退款 when refund", async () => {
    mockOrderFindUnique.mockResolvedValue(baseOrder);
    mockDisputeFindUnique.mockResolvedValue(tableDispute);
    mockDisputeUpsert.mockResolvedValue({ ...tableDispute, status: "resolved_refund" });
    mockOrderUpdate.mockResolvedValue({});

    await resolveDispute({
      orderId: "ORD-1",
      resolution: "refund",
    });

    expect(mockOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ stage: "已退款" }),
      })
    );
  });
});

describe("getDispute", () => {
  it("returns dispute from dedicated table", async () => {
    mockDisputeFindUnique.mockResolvedValue(tableDispute);

    const result = await getDispute("ORD-1");

    expect(result).toMatchObject({ id: "DSP-1", status: "pending" });
  });

  it("falls back to order meta when table record missing", async () => {
    mockDisputeFindUnique.mockResolvedValue(null);
    mockOrderFindUnique.mockResolvedValue({
      ...baseOrder,
      meta: {
        dispute: {
          id: "DSP-legacy",
          status: "pending",
          reason: "service_quality",
          description: "legacy",
          userAddress: "0xuser",
          createdAt: new Date().toISOString(),
        },
      },
    });
    mockDisputeUpsert.mockResolvedValue({ ...tableDispute, id: "DSP-legacy" });

    const result = await getDispute("ORD-1");

    expect(result).toMatchObject({ id: "DSP-legacy", status: "pending" });
  });

  it("returns null when order not found", async () => {
    mockDisputeFindUnique.mockResolvedValue(null);
    mockOrderFindUnique.mockResolvedValue(null);

    const result = await getDispute("ORD-999");

    expect(result).toBeNull();
  });

  it("returns null when order has no dispute in meta", async () => {
    mockDisputeFindUnique.mockResolvedValue(null);
    mockOrderFindUnique.mockResolvedValue({ ...baseOrder, meta: {} });

    const result = await getDispute("ORD-1");

    expect(result).toBeNull();
  });
});

describe("listUserDisputes", () => {
  it("returns disputes from dedicated table", async () => {
    mockDisputeFindMany.mockResolvedValue([
      tableDispute,
      {
        ...tableDispute,
        id: "DSP-2",
        orderId: "ORD-2",
        status: "resolved_refund",
      },
    ]);
    mockOrderFindMany.mockResolvedValue([]);

    const result = await listUserDisputes("0xuser");

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: "DSP-1" });
  });

  it("includes legacy meta disputes not yet migrated", async () => {
    mockDisputeFindMany.mockResolvedValue([]);
    mockOrderFindMany.mockResolvedValue([
      {
        ...baseOrder,
        id: "ORD-9",
        meta: {
          dispute: {
            id: "DSP-legacy",
            orderId: "ORD-9",
            userAddress: "0xuser",
            reason: "other",
            description: "legacy",
            status: "pending",
            createdAt: new Date("2026-03-01T00:00:00.000Z").toISOString(),
          },
        },
      },
    ]);

    const result = await listUserDisputes("0xuser");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "DSP-legacy", orderId: "ORD-9" });
  });

  it("returns empty array when no disputes", async () => {
    mockDisputeFindMany.mockResolvedValue([]);
    mockOrderFindMany.mockResolvedValue([]);

    const result = await listUserDisputes("0xuser");

    expect(result).toHaveLength(0);
  });
});
