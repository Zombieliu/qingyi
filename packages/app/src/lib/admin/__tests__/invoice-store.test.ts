import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  adminInvoiceRequest: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    count: vi.fn(),
  },
  $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(mockPrisma)),
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

import {
  queryInvoiceRequests,
  queryInvoiceRequestsCursor,
  addInvoiceRequest,
  updateInvoiceRequest,
  removeInvoiceRequest,
} from "../invoice-store";

function makeInvoiceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "invoice-1",
    user: "user1",
    userAddress: "0xUSER",
    contact: "phone123",
    email: "test@example.com",
    orderId: "order-1",
    amount: 200,
    title: "公司A",
    taxId: "TAX123",
    address: "北京市",
    status: "待审核",
    note: null,
    meta: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: null,
    ...overrides,
  };
}

describe("invoice-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("queryInvoiceRequests", () => {
    it("should paginate and return total info", async () => {
      mockPrisma.adminInvoiceRequest.count.mockResolvedValue(12);
      mockPrisma.adminInvoiceRequest.findMany.mockResolvedValue([makeInvoiceRow()]);
      const result = await queryInvoiceRequests({ page: 1, pageSize: 10 });
      expect(result.total).toBe(12);
      expect(result.totalPages).toBe(2);
      expect(result.items).toHaveLength(1);
      expect(result.items[0].amount).toBe(200);
    });

    it("should filter by status", async () => {
      mockPrisma.adminInvoiceRequest.count.mockResolvedValue(0);
      mockPrisma.adminInvoiceRequest.findMany.mockResolvedValue([]);
      await queryInvoiceRequests({ page: 1, pageSize: 10, status: "已开票" });
      const call = mockPrisma.adminInvoiceRequest.count.mock.calls[0][0];
      expect(call.where.status).toBe("已开票");
    });

    it("should not filter status when '全部'", async () => {
      mockPrisma.adminInvoiceRequest.count.mockResolvedValue(0);
      mockPrisma.adminInvoiceRequest.findMany.mockResolvedValue([]);
      await queryInvoiceRequests({ page: 1, pageSize: 10, status: "全部" });
      const call = mockPrisma.adminInvoiceRequest.count.mock.calls[0][0];
      expect(call.where.status).toBeUndefined();
    });

    it("should filter by keyword", async () => {
      mockPrisma.adminInvoiceRequest.count.mockResolvedValue(0);
      mockPrisma.adminInvoiceRequest.findMany.mockResolvedValue([]);
      await queryInvoiceRequests({ page: 1, pageSize: 10, q: "公司" });
      const call = mockPrisma.adminInvoiceRequest.count.mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toHaveLength(7);
    });

    it("should clamp page to valid range", async () => {
      mockPrisma.adminInvoiceRequest.count.mockResolvedValue(5);
      mockPrisma.adminInvoiceRequest.findMany.mockResolvedValue([]);
      const result = await queryInvoiceRequests({ page: 100, pageSize: 10 });
      expect(result.page).toBe(1);
    });
  });

  describe("queryInvoiceRequestsCursor", () => {
    it("should return items and nextCursor when hasMore", async () => {
      const rows = [makeInvoiceRow({ id: "i1" }), makeInvoiceRow({ id: "i2" })];
      mockPrisma.adminInvoiceRequest.findMany.mockResolvedValue(rows);
      const result = await queryInvoiceRequestsCursor({ pageSize: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeDefined();
    });

    it("should return null nextCursor when no more", async () => {
      mockPrisma.adminInvoiceRequest.findMany.mockResolvedValue([makeInvoiceRow()]);
      const result = await queryInvoiceRequestsCursor({ pageSize: 5 });
      expect(result.nextCursor).toBeNull();
    });

    it("should filter by keyword", async () => {
      mockPrisma.adminInvoiceRequest.findMany.mockResolvedValue([]);
      await queryInvoiceRequestsCursor({ pageSize: 10, q: "公司" });
      const call = mockPrisma.adminInvoiceRequest.findMany.mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toHaveLength(4);
    });

    it("should filter by status", async () => {
      mockPrisma.adminInvoiceRequest.findMany.mockResolvedValue([]);
      await queryInvoiceRequestsCursor({ pageSize: 10, status: "已开票" });
      const call = mockPrisma.adminInvoiceRequest.findMany.mock.calls[0][0];
      expect(call.where.status).toBe("已开票");
    });

    it("should not filter status when '全部'", async () => {
      mockPrisma.adminInvoiceRequest.findMany.mockResolvedValue([]);
      await queryInvoiceRequestsCursor({ pageSize: 10, status: "全部" });
      const call = mockPrisma.adminInvoiceRequest.findMany.mock.calls[0][0];
      expect(call.where.status).toBeUndefined();
    });
  });

  describe("addInvoiceRequest", () => {
    it("should create and return mapped invoice request", async () => {
      mockPrisma.adminInvoiceRequest.create.mockResolvedValue(makeInvoiceRow());
      const request = {
        id: "invoice-1",
        status: "待审核" as const,
        createdAt: Date.now(),
      };
      const result = await addInvoiceRequest(request);
      expect(result.id).toBe("invoice-1");
      expect(result.email).toBe("test@example.com");
      expect(mockPrisma.adminInvoiceRequest.create).toHaveBeenCalled();
    });

    it("should handle invoice with all null optional fields", async () => {
      mockPrisma.adminInvoiceRequest.create.mockResolvedValue(
        makeInvoiceRow({
          user: null,
          userAddress: null,
          contact: null,
          email: null,
          orderId: null,
          amount: null,
          title: null,
          taxId: null,
          address: null,
          note: null,
          meta: null,
          updatedAt: null,
        })
      );
      const request = {
        id: "invoice-2",
        status: "待审核" as const,
        createdAt: Date.now(),
      };
      const result = await addInvoiceRequest(request);
      expect(result.user).toBeUndefined();
      expect(result.userAddress).toBeUndefined();
      expect(result.contact).toBeUndefined();
      expect(result.email).toBeUndefined();
      expect(result.orderId).toBeUndefined();
      expect(result.amount).toBeUndefined();
      expect(result.title).toBeUndefined();
      expect(result.taxId).toBeUndefined();
      expect(result.address).toBeUndefined();
      expect(result.note).toBeUndefined();
      expect(result.meta).toBeUndefined();
      expect(result.updatedAt).toBeUndefined();
    });

    it("should handle invoice with updatedAt and meta set", async () => {
      const updatedDate = new Date("2026-02-01");
      mockPrisma.adminInvoiceRequest.create.mockResolvedValue(
        makeInvoiceRow({ updatedAt: updatedDate, meta: { ref: "abc" } })
      );
      const request = {
        id: "invoice-3",
        status: "待审核" as const,
        createdAt: Date.now(),
        updatedAt: updatedDate.getTime(),
        meta: { ref: "abc" },
      };
      const result = await addInvoiceRequest(request);
      expect(result.updatedAt).toBe(updatedDate.getTime());
      expect(result.meta).toEqual({ ref: "abc" });
    });
  });

  describe("updateInvoiceRequest", () => {
    it("should update and return mapped invoice request", async () => {
      mockPrisma.adminInvoiceRequest.update.mockResolvedValue(makeInvoiceRow({ status: "已开票" }));
      const result = await updateInvoiceRequest("invoice-1", { status: "已开票" });
      expect(result).not.toBeNull();
      expect(result!.status).toBe("已开票");
    });

    it("should return null on error", async () => {
      mockPrisma.adminInvoiceRequest.update.mockRejectedValue(new Error("not found"));
      const result = await updateInvoiceRequest("nonexistent", { status: "已开票" });
      expect(result).toBeNull();
    });
  });

  describe("removeInvoiceRequest", () => {
    it("should return true on success", async () => {
      mockPrisma.adminInvoiceRequest.delete.mockResolvedValue({});
      const result = await removeInvoiceRequest("invoice-1");
      expect(result).toBe(true);
    });

    it("should return false on error", async () => {
      mockPrisma.adminInvoiceRequest.delete.mockRejectedValue(new Error("not found"));
      const result = await removeInvoiceRequest("nonexistent");
      expect(result).toBe(false);
    });
  });
});
