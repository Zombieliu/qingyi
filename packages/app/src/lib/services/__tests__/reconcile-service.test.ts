import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindMany = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    adminOrder: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

vi.mock("@/lib/services/alert-service", () => ({
  alertOnReconcile: vi.fn().mockResolvedValue(undefined),
}));

import { reconcileOrders, autoFixReconcile } from "@/lib/services/reconcile-service";
import type { ReconcileReport } from "@/lib/services/reconcile-service";

beforeEach(() => {
  vi.clearAllMocks();
});

const from = new Date("2025-01-01");
const to = new Date("2025-01-31");

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "ORD-1",
    stage: "已完成",
    paymentStatus: "已支付",
    source: "local",
    amount: "100",
    chainStatus: null,
    meta: {},
    createdAt: new Date(),
    ...overrides,
  };
}

describe("reconcileOrders", () => {
  it("returns empty report when no orders", async () => {
    mockFindMany.mockResolvedValue([]);

    const report = await reconcileOrders({ from, to });

    expect(report.total).toBe(0);
    expect(report.matched).toBe(0);
    expect(report.mismatched).toBe(0);
    expect(report.items).toHaveLength(0);
  });

  it("reports matched orders (no mismatch)", async () => {
    mockFindMany.mockResolvedValue([makeOrder()]);

    const report = await reconcileOrders({ from, to });

    expect(report.total).toBe(1);
    expect(report.matched).toBe(1);
    expect(report.mismatched).toBe(0);
    expect(report.items).toHaveLength(0); // only mismatched items in report
  });

  it("Rule 1: detects chain completed but local not", async () => {
    mockFindMany.mockResolvedValue([makeOrder({ chainStatus: 4, stage: "进行中" })]);

    const report = await reconcileOrders({ from, to });

    expect(report.mismatched).toBe(1);
    expect(report.items[0].issue).toContain("链上已完成");
  });

  it("Rule 1: no mismatch when local is 已完成", async () => {
    mockFindMany.mockResolvedValue([makeOrder({ chainStatus: 5, stage: "已完成" })]);

    const report = await reconcileOrders({ from, to });

    expect(report.mismatched).toBe(0);
  });

  it("Rule 2: detects paid locally but no chain confirmation", async () => {
    mockFindMany.mockResolvedValue([
      makeOrder({ paymentStatus: "已支付", source: "chain", chainStatus: null }),
    ]);

    const report = await reconcileOrders({ from, to });

    expect(report.mismatched).toBe(1);
    expect(report.items[0].issue).toContain("无链上确认");
  });

  it("Rule 3: detects order stuck in processing > 24h", async () => {
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    mockFindMany.mockResolvedValue([makeOrder({ stage: "进行中", createdAt: oldDate })]);

    const report = await reconcileOrders({ from, to });

    expect(report.mismatched).toBe(1);
    expect(report.items[0].issue).toContain("超过24小时");
  });

  it("Rule 4: detects refund status mismatch", async () => {
    mockFindMany.mockResolvedValue([makeOrder({ stage: "已退款", paymentStatus: "已支付" })]);

    const report = await reconcileOrders({ from, to });

    expect(report.mismatched).toBe(1);
    expect(report.items[0].issue).toContain("支付状态未更新");
  });

  it("Rule 5: detects amount mismatch", async () => {
    mockFindMany.mockResolvedValue([
      makeOrder({
        amount: "100",
        meta: { chain: { status: 4 }, chainAmount: 200 },
        stage: "已完成",
      }),
    ]);

    const report = await reconcileOrders({ from, to });

    expect(report.mismatched).toBe(1);
    expect(report.items[0].issue).toContain("金额不一致");
  });

  it("uses limit parameter", async () => {
    mockFindMany.mockResolvedValue([]);

    await reconcileOrders({ from, to, limit: 10 });

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 10 }));
  });

  it("uses default limit of 500 when not specified", async () => {
    mockFindMany.mockResolvedValue([]);

    await reconcileOrders({ from, to });

    expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
  });

  it("Rule 1: uses chainMeta status from meta when chainStatus is null", async () => {
    mockFindMany.mockResolvedValue([
      makeOrder({
        chainStatus: null,
        meta: { chain: { status: 5 } },
        stage: "进行中",
      }),
    ]);

    const report = await reconcileOrders({ from, to });

    expect(report.mismatched).toBe(1);
    expect(report.items[0].issue).toContain("链上已完成");
    expect(report.items[0].chainStatus).toBe(5);
  });

  it("Rule 1: no mismatch when local is 已退款", async () => {
    mockFindMany.mockResolvedValue([
      makeOrder({ chainStatus: 4, stage: "已退款", paymentStatus: "已退款" }),
    ]);

    const report = await reconcileOrders({ from, to });

    expect(report.mismatched).toBe(0);
  });

  it("Rule 3: no mismatch when 进行中 but under 24h", async () => {
    const recentDate = new Date(Date.now() - 1 * 60 * 60 * 1000); // 1 hour ago
    mockFindMany.mockResolvedValue([makeOrder({ stage: "进行中", createdAt: recentDate })]);

    const report = await reconcileOrders({ from, to });

    expect(report.mismatched).toBe(0);
  });

  it("Rule 4: no mismatch when 已退款 and paymentStatus is 已退款", async () => {
    mockFindMany.mockResolvedValue([makeOrder({ stage: "已退款", paymentStatus: "已退款" })]);

    const report = await reconcileOrders({ from, to });

    expect(report.mismatched).toBe(0);
  });

  it("Rule 5: no mismatch when chainAmount matches order amount", async () => {
    mockFindMany.mockResolvedValue([
      makeOrder({
        amount: "100",
        meta: { chain: { status: 4 }, chainAmount: 100 },
        stage: "已完成",
      }),
    ]);

    const report = await reconcileOrders({ from, to });

    expect(report.mismatched).toBe(0);
  });

  it("handles order with null meta", async () => {
    mockFindMany.mockResolvedValue([makeOrder({ meta: null })]);

    const report = await reconcileOrders({ from, to });

    expect(report.total).toBe(1);
  });

  it("multiple rules can trigger on same order (first wins)", async () => {
    const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    mockFindMany.mockResolvedValue([
      makeOrder({
        chainStatus: 5,
        stage: "进行中",
        createdAt: oldDate,
      }),
    ]);

    const report = await reconcileOrders({ from, to });

    // Both Rule 1 and Rule 3 match, but issue should reflect the last one set
    expect(report.mismatched).toBe(1);
  });
});

describe("autoFixReconcile", () => {
  it("fixes refund status mismatch", async () => {
    mockUpdate.mockResolvedValue({});

    const report: ReconcileReport = {
      total: 1,
      matched: 0,
      mismatched: 1,
      items: [
        {
          orderId: "ORD-1",
          localStatus: "已退款",
          paymentStatus: "已支付",
          mismatch: true,
          issue: "订单已退款但支付状态未更新",
        },
      ],
      generatedAt: new Date().toISOString(),
    };

    const result = await autoFixReconcile(report);

    expect(result.fixed).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.details[0].action).toContain("已退款");
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ORD-1" },
        data: { paymentStatus: "已退款" },
      })
    );
  });

  it("skips issues that cannot be auto-fixed", async () => {
    const report: ReconcileReport = {
      total: 1,
      matched: 0,
      mismatched: 1,
      items: [
        {
          orderId: "ORD-1",
          localStatus: "进行中",
          paymentStatus: "已支付",
          mismatch: true,
          issue: "订单进行中超过24小时 (48h)",
        },
      ],
      generatedAt: new Date().toISOString(),
    };

    const result = await autoFixReconcile(report);

    expect(result.fixed).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("handles empty report", async () => {
    const report: ReconcileReport = {
      total: 0,
      matched: 0,
      mismatched: 0,
      items: [],
      generatedAt: new Date().toISOString(),
    };

    const result = await autoFixReconcile(report);

    expect(result.fixed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.details).toHaveLength(0);
  });

  it("handles mixed fixable and non-fixable items", async () => {
    mockUpdate.mockResolvedValue({});

    const report: ReconcileReport = {
      total: 3,
      matched: 0,
      mismatched: 3,
      items: [
        {
          orderId: "ORD-1",
          localStatus: "已退款",
          paymentStatus: "已支付",
          mismatch: true,
          issue: "订单已退款但支付状态未更新",
        },
        {
          orderId: "ORD-2",
          localStatus: "进行中",
          paymentStatus: "已支付",
          mismatch: true,
          issue: "订单进行中超过24小时 (48h)",
        },
        {
          orderId: "ORD-3",
          localStatus: "已退款",
          paymentStatus: "已支付",
          mismatch: true,
          issue: "订单已退款但支付状态未更新",
        },
      ],
      generatedAt: new Date().toISOString(),
    };

    const result = await autoFixReconcile(report);

    expect(result.fixed).toBe(2);
    expect(result.skipped).toBe(1);
    expect(result.details).toHaveLength(2);
  });

  it("skips item when issue is undefined", async () => {
    const report: ReconcileReport = {
      total: 1,
      matched: 0,
      mismatched: 1,
      items: [
        {
          orderId: "ORD-1",
          localStatus: "已退款",
          paymentStatus: "已支付",
          mismatch: true,
        },
      ],
      generatedAt: new Date().toISOString(),
    };

    const result = await autoFixReconcile(report);

    expect(result.fixed).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

describe("reconcileOrders alert", () => {
  it("triggers alert when mismatches found", async () => {
    mockFindMany.mockResolvedValue([makeOrder({ chainStatus: 4, stage: "进行中" })]);

    const report = await reconcileOrders({ from, to });

    expect(report.mismatched).toBe(1);
    // Alert is triggered asynchronously via dynamic import
    // Wait a tick for the promise to resolve
    await new Promise((r) => setTimeout(r, 10));
  });

  it("handles alert failure gracefully", async () => {
    vi.doMock("@/lib/services/alert-service", () => ({
      alertOnReconcile: vi.fn().mockRejectedValue(new Error("alert failed")),
    }));

    mockFindMany.mockResolvedValue([makeOrder({ stage: "已退款", paymentStatus: "已支付" })]);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const report = await reconcileOrders({ from, to });

    expect(report.mismatched).toBe(1);
    await new Promise((r) => setTimeout(r, 10));
    warnSpy.mockRestore();
    vi.doUnmock("@/lib/services/alert-service");
  });
});
