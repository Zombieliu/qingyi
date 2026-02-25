import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  adminOrder: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    upsert: vi.fn(),
    aggregate: vi.fn(),
    groupBy: vi.fn(),
  },
  $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
  $queryRaw: vi.fn(),
  $executeRaw: vi.fn(),
}));

vi.mock("../admin-store-utils", () => ({
  prisma: mockPrisma,
  Prisma: { DbNull: "DbNull" },
  appendCursorWhere: vi.fn(),
  buildCursorPayload: vi.fn((row: { id: string; createdAt: Date }) => ({
    id: row.id,
    createdAt: row.createdAt.getTime(),
  })),
}));

vi.mock("@/lib/chain/chain-status", () => ({
  mapPaymentStatus: vi.fn((status: number) => {
    const map: Record<number, string> = {
      0: "未支付",
      1: "撮合费已付",
      2: "押金已锁定",
      3: "待结算",
      4: "争议中",
      5: "已结算",
      6: "已取消",
    };
    return map[status] ?? "未知";
  }),
}));

vi.mock("../mantou-store", () => ({
  creditMantou: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/growth-service", () => ({
  onOrderCompleted: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/services/notification-service", () => ({
  notifyOrderStatusChange: vi.fn().mockResolvedValue(undefined),
  notifyCompanionNewOrder: vi.fn().mockResolvedValue(undefined),
}));

import {
  listOrders,
  listChainOrdersForAdmin,
  listChainOrdersForAutoFinalize,
  listChainOrdersForCleanup,
  queryOrders,
  queryOrdersCursor,
  hasOrdersForAddress,
  getOrderById,
  queryPublicOrdersCursor,
  removeOrders,
  listE2eOrderIds,
  addOrder,
  updateOrder,
  updateOrderIfUnassigned,
  upsertOrder,
} from "../order-store";

function makeOrderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-1",
    user: "user1",
    userAddress: "0xABC",
    companionAddress: null,
    item: "王者荣耀",
    amount: 100,
    currency: "CNY",
    paymentStatus: "待处理",
    stage: "待处理",
    note: null,
    assignedTo: null,
    source: null,
    chainDigest: null,
    chainStatus: null,
    serviceFee: null,
    deposit: null,
    meta: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: null,
    ...overrides,
  };
}

describe("order-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listOrders", () => {
    it("should return mapped orders with default limit", async () => {
      const row = makeOrderRow();
      mockPrisma.adminOrder.findMany.mockResolvedValue([row]);
      const result = await listOrders();
      expect(mockPrisma.adminOrder.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 1000,
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("order-1");
      expect(result[0].amount).toBe(100);
    });

    it("should use custom limit", async () => {
      mockPrisma.adminOrder.findMany.mockResolvedValue([]);
      await listOrders(50);
      expect(mockPrisma.adminOrder.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    });

    it("should map chain order displayStatus from chainStatus", async () => {
      const row = makeOrderRow({ chainDigest: "0xDEAD", chainStatus: 2 });
      mockPrisma.adminOrder.findMany.mockResolvedValue([row]);
      const result = await listOrders();
      expect(result[0].displayStatus).toBe("押金已锁定");
    });

    it("should use paymentStatus as displayStatus for non-chain orders", async () => {
      const row = makeOrderRow({ paymentStatus: "已支付" });
      mockPrisma.adminOrder.findMany.mockResolvedValue([row]);
      const result = await listOrders();
      expect(result[0].displayStatus).toBe("已支付");
    });

    it("should use stage as displayStatus when paymentStatus is empty", async () => {
      const row = makeOrderRow({ paymentStatus: "", stage: "待处理" });
      mockPrisma.adminOrder.findMany.mockResolvedValue([row]);
      const result = await listOrders();
      expect(result[0].displayStatus).toBe("待处理");
    });

    it("should use paymentStatus for chain order with null chainStatus", async () => {
      const row = makeOrderRow({
        chainDigest: "0xDEAD",
        chainStatus: null,
        paymentStatus: "已支付",
      });
      mockPrisma.adminOrder.findMany.mockResolvedValue([row]);
      const result = await listOrders();
      expect(result[0].displayStatus).toBe("已支付");
    });
  });

  describe("listChainOrdersForAdmin", () => {
    it("should return chain order fields only", async () => {
      mockPrisma.adminOrder.findMany.mockResolvedValue([
        { id: "c1", chainStatus: 1, chainDigest: "0x1", source: "chain", meta: null },
      ]);
      const result = await listChainOrdersForAdmin();
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        id: "c1",
        chainStatus: 1,
        chainDigest: "0x1",
        source: "chain",
        meta: undefined,
      });
    });
  });

  describe("listChainOrdersForAutoFinalize", () => {
    it("should return chain order fields", async () => {
      mockPrisma.adminOrder.findMany.mockResolvedValue([
        { id: "c2", chainStatus: 3, chainDigest: "0x2", source: "chain", meta: { foo: 1 } },
      ]);
      const result = await listChainOrdersForAutoFinalize();
      expect(result[0].meta).toEqual({ foo: 1 });
    });
  });

  describe("listChainOrdersForCleanup", () => {
    it("should return id, source, createdAt as timestamp", async () => {
      const date = new Date("2026-02-01");
      mockPrisma.adminOrder.findMany.mockResolvedValue([
        { id: "c3", source: "chain", createdAt: date },
      ]);
      const result = await listChainOrdersForCleanup();
      expect(result[0]).toEqual({
        id: "c3",
        source: "chain",
        createdAt: date.getTime(),
      });
    });
  });

  describe("queryOrders", () => {
    it("should paginate and return total info", async () => {
      mockPrisma.adminOrder.count.mockResolvedValue(25);
      mockPrisma.adminOrder.findMany.mockResolvedValue([makeOrderRow()]);
      const result = await queryOrders({ page: 1, pageSize: 10 });
      expect(result.total).toBe(25);
      expect(result.totalPages).toBe(3);
      expect(result.page).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it("should clamp page to totalPages when page exceeds", async () => {
      mockPrisma.adminOrder.count.mockResolvedValue(5);
      mockPrisma.adminOrder.findMany.mockResolvedValue([]);
      const result = await queryOrders({ page: 100, pageSize: 10 });
      expect(result.page).toBe(1);
    });

    it("should filter by stage", async () => {
      mockPrisma.adminOrder.count.mockResolvedValue(0);
      mockPrisma.adminOrder.findMany.mockResolvedValue([]);
      await queryOrders({ page: 1, pageSize: 10, stage: "已完成" });
      const countCall = mockPrisma.adminOrder.count.mock.calls[0][0];
      expect(countCall.where.stage).toBe("已完成");
    });

    it("should not filter stage when '全部'", async () => {
      mockPrisma.adminOrder.count.mockResolvedValue(0);
      mockPrisma.adminOrder.findMany.mockResolvedValue([]);
      await queryOrders({ page: 1, pageSize: 10, stage: "全部" });
      const countCall = mockPrisma.adminOrder.count.mock.calls[0][0];
      expect(countCall.where.stage).toBeUndefined();
    });

    it("should filter by keyword in user/item/id", async () => {
      mockPrisma.adminOrder.count.mockResolvedValue(0);
      mockPrisma.adminOrder.findMany.mockResolvedValue([]);
      await queryOrders({ page: 1, pageSize: 10, q: "test" });
      const countCall = mockPrisma.adminOrder.count.mock.calls[0][0];
      expect(countCall.where.AND).toBeDefined();
    });

    it("should filter by assignedTo", async () => {
      mockPrisma.adminOrder.count.mockResolvedValue(0);
      mockPrisma.adminOrder.findMany.mockResolvedValue([]);
      await queryOrders({ page: 1, pageSize: 10, assignedTo: "player-1" });
      const countCall = mockPrisma.adminOrder.count.mock.calls[0][0];
      expect(countCall.where.assignedTo).toBe("player-1");
    });

    it("should filter by companionMissing", async () => {
      mockPrisma.adminOrder.count.mockResolvedValue(0);
      mockPrisma.adminOrder.findMany.mockResolvedValue([]);
      await queryOrders({ page: 1, pageSize: 10, companionMissing: true });
      const countCall = mockPrisma.adminOrder.count.mock.calls[0][0];
      expect(countCall.where.companionAddress).toBeNull();
    });

    it("should filter by address (both user and companion)", async () => {
      mockPrisma.adminOrder.count.mockResolvedValue(0);
      mockPrisma.adminOrder.findMany.mockResolvedValue([]);
      await queryOrders({ page: 1, pageSize: 10, address: "0xABC" });
      const countCall = mockPrisma.adminOrder.count.mock.calls[0][0];
      expect(countCall.where.AND).toBeDefined();
    });

    it("should filter by paymentStatus", async () => {
      mockPrisma.adminOrder.count.mockResolvedValue(0);
      mockPrisma.adminOrder.findMany.mockResolvedValue([]);
      await queryOrders({ page: 1, pageSize: 10, paymentStatus: "已支付" });
      const countCall = mockPrisma.adminOrder.count.mock.calls[0][0];
      expect(countCall.where.paymentStatus).toBe("已支付");
    });

    it("should filter by userAddress when address is not set", async () => {
      mockPrisma.adminOrder.count.mockResolvedValue(0);
      mockPrisma.adminOrder.findMany.mockResolvedValue([]);
      await queryOrders({ page: 1, pageSize: 10, userAddress: "0xUSER" });
      const countCall = mockPrisma.adminOrder.count.mock.calls[0][0];
      expect(countCall.where.userAddress).toBe("0xUSER");
    });

    it("should filter by excludeStages", async () => {
      mockPrisma.adminOrder.count.mockResolvedValue(0);
      mockPrisma.adminOrder.findMany.mockResolvedValue([]);
      await queryOrders({ page: 1, pageSize: 10, excludeStages: ["已取消", "已退款"] });
      const countCall = mockPrisma.adminOrder.count.mock.calls[0][0];
      expect(countCall.where.stage).toEqual({ notIn: ["已取消", "已退款"] });
    });
  });

  describe("queryOrdersCursor", () => {
    it("should return items and nextCursor when hasMore", async () => {
      const rows = [makeOrderRow({ id: "o1" }), makeOrderRow({ id: "o2" })];
      mockPrisma.adminOrder.findMany.mockResolvedValue(rows);
      const result = await queryOrdersCursor({ pageSize: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeDefined();
    });

    it("should return null nextCursor when no more", async () => {
      mockPrisma.adminOrder.findMany.mockResolvedValue([makeOrderRow()]);
      const result = await queryOrdersCursor({ pageSize: 5 });
      expect(result.nextCursor).toBeNull();
    });
  });

  describe("hasOrdersForAddress", () => {
    it("should return true when count > 0", async () => {
      mockPrisma.adminOrder.count.mockResolvedValue(3);
      const result = await hasOrdersForAddress("0xABC");
      expect(result).toBe(true);
    });

    it("should return false when count is 0", async () => {
      mockPrisma.adminOrder.count.mockResolvedValue(0);
      const result = await hasOrdersForAddress("0xABC");
      expect(result).toBe(false);
    });

    it("should return false for empty address", async () => {
      const result = await hasOrdersForAddress("");
      expect(result).toBe(false);
      expect(mockPrisma.adminOrder.count).not.toHaveBeenCalled();
    });
  });

  describe("getOrderById", () => {
    it("should return mapped order when found", async () => {
      mockPrisma.adminOrder.findUnique.mockResolvedValue(makeOrderRow());
      const result = await getOrderById("order-1");
      expect(result).not.toBeNull();
      expect(result!.id).toBe("order-1");
    });

    it("should return null when not found", async () => {
      mockPrisma.adminOrder.findUnique.mockResolvedValue(null);
      const result = await getOrderById("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("queryPublicOrdersCursor", () => {
    it("should filter companionAddress null and return items", async () => {
      mockPrisma.adminOrder.findMany.mockResolvedValue([makeOrderRow()]);
      const result = await queryPublicOrdersCursor({ pageSize: 10 });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it("should apply cursor when provided", async () => {
      mockPrisma.adminOrder.findMany.mockResolvedValue([]);
      await queryPublicOrdersCursor({
        pageSize: 10,
        cursor: { createdAt: Date.now(), id: "prev-id" },
      });
      expect(mockPrisma.adminOrder.findMany).toHaveBeenCalled();
    });

    it("should apply excludeStages", async () => {
      mockPrisma.adminOrder.findMany.mockResolvedValue([]);
      await queryPublicOrdersCursor({
        pageSize: 10,
        excludeStages: ["已取消"],
      });
      const call = mockPrisma.adminOrder.findMany.mock.calls[0][0];
      expect(call.where.stage).toEqual({ notIn: ["已取消"] });
    });

    it("should return nextCursor when hasMore", async () => {
      const rows = [makeOrderRow({ id: "o1" }), makeOrderRow({ id: "o2" })];
      mockPrisma.adminOrder.findMany.mockResolvedValue(rows);
      const result = await queryPublicOrdersCursor({ pageSize: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).not.toBeNull();
    });
  });

  describe("removeOrders", () => {
    it("should delete orders by ids and return count", async () => {
      mockPrisma.adminOrder.deleteMany.mockResolvedValue({ count: 2 });
      const result = await removeOrders(["o1", "o2"]);
      expect(result).toBe(2);
    });

    it("should return 0 for empty array", async () => {
      const result = await removeOrders([]);
      expect(result).toBe(0);
      expect(mockPrisma.adminOrder.deleteMany).not.toHaveBeenCalled();
    });

    it("should filter out falsy ids", async () => {
      mockPrisma.adminOrder.deleteMany.mockResolvedValue({ count: 1 });
      const result = await removeOrders(["o1", ""]);
      expect(result).toBe(1);
      const call = mockPrisma.adminOrder.deleteMany.mock.calls[0][0];
      expect(call.where.id.in).toEqual(["o1"]);
    });
  });

  describe("listE2eOrderIds", () => {
    it("should return array of ids", async () => {
      mockPrisma.adminOrder.findMany.mockResolvedValue([
        { id: "E2E-ORDER-1" },
        { id: "E2E-ORDER-2" },
      ]);
      const result = await listE2eOrderIds();
      expect(result).toEqual(["E2E-ORDER-1", "E2E-ORDER-2"]);
    });
  });

  describe("addOrder", () => {
    it("should create order and return mapped result", async () => {
      const row = makeOrderRow();
      mockPrisma.adminOrder.create.mockResolvedValue(row);
      const order = {
        id: "order-1",
        user: "user1",
        item: "王者荣耀",
        amount: 100,
        currency: "CNY",
        paymentStatus: "待处理",
        stage: "待处理" as const,
        displayStatus: "待处理",
        createdAt: Date.now(),
      };
      const result = await addOrder(order);
      expect(result.id).toBe("order-1");
      expect(mockPrisma.adminOrder.create).toHaveBeenCalled();
    });

    it("should handle order with all optional fields set", async () => {
      const row = makeOrderRow({
        userAddress: "0xUSER",
        companionAddress: "0xCOMP",
        note: "test note",
        assignedTo: "player-1",
        source: "chain",
        chainDigest: "0xDEAD",
        chainStatus: 2,
        serviceFee: 10,
        deposit: 50,
        meta: { key: "val" },
        updatedAt: new Date("2026-02-01"),
      });
      mockPrisma.adminOrder.create.mockResolvedValue(row);
      const order = {
        id: "order-2",
        user: "user2",
        item: "测试",
        amount: 200,
        currency: "CNY",
        paymentStatus: "已支付",
        stage: "进行中" as const,
        displayStatus: "押金已锁定",
        userAddress: "0xUSER",
        companionAddress: "0xCOMP",
        note: "test note",
        assignedTo: "player-1",
        source: "chain",
        chainDigest: "0xDEAD",
        chainStatus: 2,
        serviceFee: 10,
        deposit: 50,
        meta: { key: "val" },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = await addOrder(order);
      expect(result.userAddress).toBe("0xUSER");
      expect(result.companionAddress).toBe("0xCOMP");
      expect(result.note).toBe("test note");
      expect(result.assignedTo).toBe("player-1");
      expect(result.source).toBe("chain");
      expect(result.chainDigest).toBe("0xDEAD");
      expect(result.chainStatus).toBe(2);
      expect(result.serviceFee).toBe(10);
      expect(result.deposit).toBe(50);
      expect(result.meta).toEqual({ key: "val" });
      expect(result.updatedAt).toBeDefined();
    });

    it("should handle order with null optional fields", async () => {
      const row = makeOrderRow({
        userAddress: null,
        companionAddress: null,
        note: null,
        assignedTo: null,
        source: null,
        chainDigest: null,
        chainStatus: null,
        serviceFee: null,
        deposit: null,
        meta: null,
        updatedAt: null,
      });
      mockPrisma.adminOrder.create.mockResolvedValue(row);
      const order = {
        id: "order-3",
        user: "user3",
        item: "测试",
        amount: 100,
        currency: "CNY",
        paymentStatus: "待处理",
        stage: "待处理" as const,
        displayStatus: "待处理",
        createdAt: Date.now(),
      };
      const result = await addOrder(order);
      expect(result.userAddress).toBeUndefined();
      expect(result.companionAddress).toBeUndefined();
      expect(result.note).toBeUndefined();
      expect(result.assignedTo).toBeUndefined();
      expect(result.source).toBeUndefined();
      expect(result.chainDigest).toBeUndefined();
      expect(result.chainStatus).toBeUndefined();
      expect(result.serviceFee).toBeUndefined();
      expect(result.deposit).toBeUndefined();
      expect(result.meta).toBeUndefined();
      expect(result.updatedAt).toBeUndefined();
    });
  });

  describe("updateOrder", () => {
    it("should update and return mapped order", async () => {
      const row = makeOrderRow({ stage: "已确认" });
      mockPrisma.adminOrder.update.mockResolvedValue(row);
      const result = await updateOrder("order-1", { stage: "已确认" });
      expect(result).not.toBeNull();
      expect(result!.stage).toBe("已确认");
    });

    it("should return null on error", async () => {
      mockPrisma.adminOrder.update.mockRejectedValue(new Error("not found"));
      const result = await updateOrder("nonexistent", { stage: "已确认" });
      expect(result).toBeNull();
    });

    it("should merge meta with existing meta", async () => {
      mockPrisma.adminOrder.findUnique.mockResolvedValue({ meta: { existing: true } });
      const row = makeOrderRow({ meta: { existing: true, newKey: "val" } });
      mockPrisma.adminOrder.update.mockResolvedValue(row);
      const result = await updateOrder("order-1", { meta: { newKey: "val" } });
      expect(result).not.toBeNull();
      expect(mockPrisma.adminOrder.findUnique).toHaveBeenCalledWith({
        where: { id: "order-1" },
        select: { meta: true },
      });
    });

    it("should credit mantou for completed order with diamondCharge", async () => {
      const { creditMantou } = await import("../mantou-store");
      const row = makeOrderRow({
        stage: "已完成",
        companionAddress: "0xCOMP",
        meta: { diamondCharge: 100 },
      });
      mockPrisma.adminOrder.update.mockResolvedValue(row);
      const result = await updateOrder("order-1", { stage: "已完成" });
      expect(result).not.toBeNull();
      expect(creditMantou).toHaveBeenCalledWith(
        expect.objectContaining({
          address: "0xCOMP",
          amount: 100,
          orderId: "order-1",
        })
      );
    });

    it("should not credit mantou when diamondCharge is 0", async () => {
      const { creditMantou } = await import("../mantou-store");
      const row = makeOrderRow({
        stage: "已完成",
        companionAddress: "0xCOMP",
        meta: { diamondCharge: 0 },
      });
      mockPrisma.adminOrder.update.mockResolvedValue(row);
      await updateOrder("order-1", { stage: "已完成" });
      expect(creditMantou).not.toHaveBeenCalled();
    });

    it("should not credit mantou when no companionAddress", async () => {
      const { creditMantou } = await import("../mantou-store");
      const row = makeOrderRow({
        stage: "已完成",
        companionAddress: null,
        meta: { diamondCharge: 100 },
      });
      mockPrisma.adminOrder.update.mockResolvedValue(row);
      await updateOrder("order-1", { stage: "已完成" });
      expect(creditMantou).not.toHaveBeenCalled();
    });

    it("should award growth points for completed order", async () => {
      const { onOrderCompleted } = await import("@/lib/services/growth-service");
      const row = makeOrderRow({
        stage: "已完成",
        userAddress: "0xUSER",
      });
      mockPrisma.adminOrder.update.mockResolvedValue(row);
      await updateOrder("order-1", { stage: "已完成" });
      expect(onOrderCompleted).toHaveBeenCalledWith(
        expect.objectContaining({
          userAddress: "0xUSER",
          orderId: "order-1",
        })
      );
    });

    it("should notify on stage change", async () => {
      const { notifyOrderStatusChange, notifyCompanionNewOrder } =
        await import("@/lib/services/notification-service");
      const row = makeOrderRow({
        stage: "已确认",
        userAddress: "0xUSER",
        companionAddress: "0xCOMP",
      });
      mockPrisma.adminOrder.update.mockResolvedValue(row);
      await updateOrder("order-1", { stage: "已确认" });
      expect(notifyOrderStatusChange).toHaveBeenCalled();
      expect(notifyCompanionNewOrder).toHaveBeenCalled();
    });

    it("should handle meta with empty merged result", async () => {
      mockPrisma.adminOrder.findUnique.mockResolvedValue({ meta: null });
      const row = makeOrderRow({ meta: null });
      mockPrisma.adminOrder.update.mockResolvedValue(row);
      const result = await updateOrder("order-1", { meta: {} });
      expect(result).not.toBeNull();
    });

    it("should update all individual fields", async () => {
      const row = makeOrderRow({
        paymentStatus: "已支付",
        note: "updated note",
        assignedTo: "player-2",
        stage: "进行中",
        user: "user2",
        userAddress: "0xNEW",
        companionAddress: "0xCOMP",
        item: "新项目",
        amount: 200,
        currency: "USD",
        source: "chain",
        chainDigest: "0xDIGEST",
        chainStatus: 3,
        serviceFee: 15,
        deposit: 60,
      });
      mockPrisma.adminOrder.update.mockResolvedValue(row);
      const result = await updateOrder("order-1", {
        paymentStatus: "已支付",
        note: "updated note",
        assignedTo: "player-2",
        stage: "进行中",
        user: "user2",
        userAddress: "0xNEW",
        companionAddress: "0xCOMP",
        item: "新项目",
        amount: 200,
        currency: "USD",
        source: "chain",
        chainDigest: "0xDIGEST",
        chainStatus: 3,
        serviceFee: 15,
        deposit: 60,
      });
      expect(result).not.toBeNull();
      const call = mockPrisma.adminOrder.update.mock.calls[0][0];
      expect(call.data.paymentStatus).toBe("已支付");
      expect(call.data.note).toBe("updated note");
      expect(call.data.assignedTo).toBe("player-2");
      expect(call.data.stage).toBe("进行中");
      expect(call.data.user).toBe("user2");
      expect(call.data.userAddress).toBe("0xNEW");
      expect(call.data.companionAddress).toBe("0xCOMP");
      expect(call.data.item).toBe("新项目");
      expect(call.data.amount).toBe(200);
      expect(call.data.currency).toBe("USD");
      expect(call.data.source).toBe("chain");
      expect(call.data.chainDigest).toBe("0xDIGEST");
      expect(call.data.chainStatus).toBe(3);
      expect(call.data.serviceFee).toBe(15);
      expect(call.data.deposit).toBe(60);
    });
  });

  describe("updateOrderIfUnassigned", () => {
    it("should update when companionAddress is null", async () => {
      mockPrisma.adminOrder.findUnique
        .mockResolvedValueOnce({ meta: null, companionAddress: null })
        .mockResolvedValueOnce(makeOrderRow({ companionAddress: "0xCOMP" }));
      mockPrisma.adminOrder.updateMany.mockResolvedValue({ count: 1 });
      const result = await updateOrderIfUnassigned("order-1", {
        companionAddress: "0xCOMP",
      });
      expect(result).not.toBeNull();
    });

    it("should return null when already assigned", async () => {
      mockPrisma.adminOrder.findUnique.mockResolvedValue({
        meta: null,
        companionAddress: "0xEXIST",
      });
      const result = await updateOrderIfUnassigned("order-1", {
        companionAddress: "0xNEW",
      });
      expect(result).toBeNull();
    });

    it("should return null when order not found", async () => {
      mockPrisma.adminOrder.findUnique.mockResolvedValue(null);
      const result = await updateOrderIfUnassigned("nonexistent", {});
      expect(result).toBeNull();
    });

    it("should return null when updateMany count is 0 (race condition)", async () => {
      mockPrisma.adminOrder.findUnique.mockResolvedValue({
        meta: null,
        companionAddress: null,
      });
      mockPrisma.adminOrder.updateMany.mockResolvedValue({ count: 0 });
      const result = await updateOrderIfUnassigned("order-1", {
        companionAddress: "0xCOMP",
      });
      expect(result).toBeNull();
    });

    it("should update stage when companionAddress is null", async () => {
      mockPrisma.adminOrder.findUnique
        .mockResolvedValueOnce({ meta: null, companionAddress: null })
        .mockResolvedValueOnce(makeOrderRow({ stage: "已确认" }));
      mockPrisma.adminOrder.updateMany.mockResolvedValue({ count: 1 });
      const result = await updateOrderIfUnassigned("order-1", {
        stage: "已确认",
      });
      expect(result).not.toBeNull();
      const call = mockPrisma.adminOrder.updateMany.mock.calls[0][0];
      expect(call.data.stage).toBe("已确认");
    });

    it("should merge meta with existing meta in updateOrderIfUnassigned", async () => {
      mockPrisma.adminOrder.findUnique
        .mockResolvedValueOnce({ meta: { existing: true }, companionAddress: null })
        .mockResolvedValueOnce(makeOrderRow({ meta: { existing: true, newKey: "val" } }));
      mockPrisma.adminOrder.updateMany.mockResolvedValue({ count: 1 });
      const result = await updateOrderIfUnassigned("order-1", {
        meta: { newKey: "val" },
      });
      expect(result).not.toBeNull();
    });

    it("should handle meta merge with empty existing meta", async () => {
      mockPrisma.adminOrder.findUnique
        .mockResolvedValueOnce({ meta: null, companionAddress: null })
        .mockResolvedValueOnce(makeOrderRow({ meta: { newKey: "val" } }));
      mockPrisma.adminOrder.updateMany.mockResolvedValue({ count: 1 });
      const result = await updateOrderIfUnassigned("order-1", {
        meta: { newKey: "val" },
      });
      expect(result).not.toBeNull();
    });

    it("should handle meta merge with empty result", async () => {
      mockPrisma.adminOrder.findUnique
        .mockResolvedValueOnce({ meta: null, companionAddress: null })
        .mockResolvedValueOnce(makeOrderRow());
      mockPrisma.adminOrder.updateMany.mockResolvedValue({ count: 1 });
      const result = await updateOrderIfUnassigned("order-1", {
        meta: {},
      });
      expect(result).not.toBeNull();
    });

    it("should return null on exception (catch branch)", async () => {
      mockPrisma.adminOrder.findUnique.mockRejectedValue(new Error("db error"));
      const result = await updateOrderIfUnassigned("order-1", {
        companionAddress: "0xCOMP",
      });
      expect(result).toBeNull();
    });
  });

  describe("upsertOrder", () => {
    it("should upsert and return mapped order", async () => {
      const row = makeOrderRow();
      mockPrisma.adminOrder.upsert.mockResolvedValue(row);
      const order = {
        id: "order-1",
        user: "user1",
        item: "王者荣耀",
        amount: 100,
        currency: "CNY",
        paymentStatus: "待处理",
        stage: "待处理" as const,
        displayStatus: "待处理",
        createdAt: Date.now(),
      };
      const result = await upsertOrder(order);
      expect(result.id).toBe("order-1");
      expect(mockPrisma.adminOrder.upsert).toHaveBeenCalled();
    });

    it("should upsert with all optional fields", async () => {
      const row = makeOrderRow({
        userAddress: "0xUSER",
        companionAddress: "0xCOMP",
        note: "note",
        assignedTo: "player-1",
        source: "chain",
        chainDigest: "0xDEAD",
        chainStatus: 2,
        serviceFee: 10,
        deposit: 50,
        meta: { key: "val" },
        updatedAt: new Date("2026-02-01"),
      });
      mockPrisma.adminOrder.upsert.mockResolvedValue(row);
      const order = {
        id: "order-2",
        user: "user2",
        item: "测试",
        amount: 200,
        currency: "CNY",
        paymentStatus: "已支付",
        stage: "进行中" as const,
        displayStatus: "押金已锁定",
        userAddress: "0xUSER",
        companionAddress: "0xCOMP",
        note: "note",
        assignedTo: "player-1",
        source: "chain",
        chainDigest: "0xDEAD",
        chainStatus: 2,
        serviceFee: 10,
        deposit: 50,
        meta: { key: "val" },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const result = await upsertOrder(order);
      expect(result.meta).toEqual({ key: "val" });
      const call = mockPrisma.adminOrder.upsert.mock.calls[0][0];
      expect(call.create.meta).toEqual({ key: "val" });
      expect(call.update.meta).toEqual({ key: "val" });
    });

    it("should upsert with null meta", async () => {
      const row = makeOrderRow();
      mockPrisma.adminOrder.upsert.mockResolvedValue(row);
      const order = {
        id: "order-3",
        user: "user3",
        item: "测试",
        amount: 100,
        currency: "CNY",
        paymentStatus: "待处理",
        stage: "待处理" as const,
        displayStatus: "待处理",
        createdAt: Date.now(),
      };
      const result = await upsertOrder(order);
      expect(result.meta).toBeUndefined();
      const call = mockPrisma.adminOrder.upsert.mock.calls[0][0];
      expect(call.create.meta).toBe("DbNull");
    });
  });
});
