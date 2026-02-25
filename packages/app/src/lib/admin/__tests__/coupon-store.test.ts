import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  adminCoupon: {
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

vi.mock("@/lib/shared/soft-delete", () => ({
  notDeleted: { deletedAt: null },
  softDelete: () => ({ deletedAt: new Date() }),
}));

import {
  queryCoupons,
  queryCouponsCursor,
  listActiveCoupons,
  getCouponById,
  getCouponByCode,
  addCoupon,
  updateCoupon,
  removeCoupon,
} from "../coupon-store";

function makeCouponRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "coupon-1",
    title: "新人优惠",
    code: "NEW10",
    description: "新用户立减10元",
    discount: 10,
    minSpend: 50,
    status: "可用",
    startsAt: new Date("2026-01-01"),
    expiresAt: new Date("2026-12-31"),
    createdAt: new Date("2026-01-01"),
    updatedAt: null,
    ...overrides,
  };
}

describe("coupon-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("queryCoupons", () => {
    it("should paginate and return total info", async () => {
      mockPrisma.adminCoupon.count.mockResolvedValue(15);
      mockPrisma.adminCoupon.findMany.mockResolvedValue([makeCouponRow()]);
      const result = await queryCoupons({ page: 1, pageSize: 10 });
      expect(result.total).toBe(15);
      expect(result.totalPages).toBe(2);
      expect(result.items).toHaveLength(1);
    });

    it("should filter by status", async () => {
      mockPrisma.adminCoupon.count.mockResolvedValue(0);
      mockPrisma.adminCoupon.findMany.mockResolvedValue([]);
      await queryCoupons({ page: 1, pageSize: 10, status: "停用" });
      const call = mockPrisma.adminCoupon.count.mock.calls[0][0];
      expect(call.where.status).toBe("停用");
    });

    it("should not filter status when '全部'", async () => {
      mockPrisma.adminCoupon.count.mockResolvedValue(0);
      mockPrisma.adminCoupon.findMany.mockResolvedValue([]);
      await queryCoupons({ page: 1, pageSize: 10, status: "全部" });
      const call = mockPrisma.adminCoupon.count.mock.calls[0][0];
      expect(call.where.status).toBeUndefined();
    });

    it("should filter by keyword in title/code", async () => {
      mockPrisma.adminCoupon.count.mockResolvedValue(0);
      mockPrisma.adminCoupon.findMany.mockResolvedValue([]);
      await queryCoupons({ page: 1, pageSize: 10, q: "新人" });
      const call = mockPrisma.adminCoupon.count.mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
    });
  });

  describe("queryCouponsCursor", () => {
    it("should return items and nextCursor when hasMore", async () => {
      const rows = [makeCouponRow({ id: "c1" }), makeCouponRow({ id: "c2" })];
      mockPrisma.adminCoupon.findMany.mockResolvedValue(rows);
      const result = await queryCouponsCursor({ pageSize: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeDefined();
    });

    it("should return null nextCursor when no more", async () => {
      mockPrisma.adminCoupon.findMany.mockResolvedValue([makeCouponRow()]);
      const result = await queryCouponsCursor({ pageSize: 5 });
      expect(result.nextCursor).toBeNull();
    });

    it("should filter by keyword", async () => {
      mockPrisma.adminCoupon.findMany.mockResolvedValue([]);
      await queryCouponsCursor({ pageSize: 10, q: "新人" });
      const call = mockPrisma.adminCoupon.findMany.mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toHaveLength(3);
    });

    it("should filter by status", async () => {
      mockPrisma.adminCoupon.findMany.mockResolvedValue([]);
      await queryCouponsCursor({ pageSize: 10, status: "停用" });
      const call = mockPrisma.adminCoupon.findMany.mock.calls[0][0];
      expect(call.where.status).toBe("停用");
    });

    it("should not filter status when '全部'", async () => {
      mockPrisma.adminCoupon.findMany.mockResolvedValue([]);
      await queryCouponsCursor({ pageSize: 10, status: "全部" });
      const call = mockPrisma.adminCoupon.findMany.mock.calls[0][0];
      expect(call.where.status).toBeUndefined();
    });
  });

  describe("listActiveCoupons", () => {
    it("should return active coupons within date range", async () => {
      mockPrisma.adminCoupon.findMany.mockResolvedValue([makeCouponRow()]);
      const result = await listActiveCoupons();
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe("可用");
    });
  });

  describe("getCouponById", () => {
    it("should return mapped coupon when found", async () => {
      mockPrisma.adminCoupon.findUnique.mockResolvedValue(makeCouponRow());
      const result = await getCouponById("coupon-1");
      expect(result).not.toBeNull();
      expect(result!.title).toBe("新人优惠");
    });

    it("should return null when not found", async () => {
      mockPrisma.adminCoupon.findUnique.mockResolvedValue(null);
      const result = await getCouponById("nonexistent");
      expect(result).toBeNull();
    });
  });

  describe("getCouponByCode", () => {
    it("should return coupon by code (case insensitive)", async () => {
      mockPrisma.adminCoupon.findFirst.mockResolvedValue(makeCouponRow());
      const result = await getCouponByCode("new10");
      expect(result).not.toBeNull();
      expect(result!.code).toBe("NEW10");
    });

    it("should return null when code not found", async () => {
      mockPrisma.adminCoupon.findFirst.mockResolvedValue(null);
      const result = await getCouponByCode("INVALID");
      expect(result).toBeNull();
    });
  });

  describe("addCoupon", () => {
    it("should create and return mapped coupon", async () => {
      mockPrisma.adminCoupon.create.mockResolvedValue(makeCouponRow());
      const coupon = {
        id: "coupon-1",
        title: "新人优惠",
        status: "可用" as const,
        createdAt: Date.now(),
      };
      const result = await addCoupon(coupon);
      expect(result.id).toBe("coupon-1");
      expect(mockPrisma.adminCoupon.create).toHaveBeenCalled();
    });

    it("should handle coupon with all optional fields undefined", async () => {
      mockPrisma.adminCoupon.create.mockResolvedValue(
        makeCouponRow({
          code: null,
          description: null,
          discount: null,
          minSpend: null,
          startsAt: null,
          expiresAt: null,
          updatedAt: null,
        })
      );
      const coupon = {
        id: "coupon-2",
        title: "基础优惠",
        status: "可用" as const,
        createdAt: Date.now(),
      };
      const result = await addCoupon(coupon);
      expect(result.code).toBeUndefined();
      expect(result.description).toBeUndefined();
      expect(result.discount).toBeUndefined();
      expect(result.minSpend).toBeUndefined();
      expect(result.startsAt).toBeUndefined();
      expect(result.expiresAt).toBeUndefined();
      expect(result.updatedAt).toBeUndefined();
    });

    it("should handle coupon with updatedAt set", async () => {
      const updatedDate = new Date("2026-06-01");
      mockPrisma.adminCoupon.create.mockResolvedValue(makeCouponRow({ updatedAt: updatedDate }));
      const coupon = {
        id: "coupon-3",
        title: "更新优惠",
        status: "可用" as const,
        createdAt: Date.now(),
        updatedAt: updatedDate.getTime(),
      };
      const result = await addCoupon(coupon);
      expect(result.updatedAt).toBe(updatedDate.getTime());
    });

    it("should handle coupon with startsAt and expiresAt set", async () => {
      const startsAt = new Date("2026-03-01");
      const expiresAt = new Date("2026-12-31");
      mockPrisma.adminCoupon.create.mockResolvedValue(makeCouponRow({ startsAt, expiresAt }));
      const coupon = {
        id: "coupon-4",
        title: "限时优惠",
        status: "可用" as const,
        createdAt: Date.now(),
        startsAt: startsAt.getTime(),
        expiresAt: expiresAt.getTime(),
      };
      const result = await addCoupon(coupon);
      expect(result.startsAt).toBe(startsAt.getTime());
      expect(result.expiresAt).toBe(expiresAt.getTime());
    });
  });

  describe("updateCoupon", () => {
    it("should update and return mapped coupon", async () => {
      mockPrisma.adminCoupon.update.mockResolvedValue(makeCouponRow({ title: "Updated" }));
      const result = await updateCoupon("coupon-1", { title: "Updated" });
      expect(result).not.toBeNull();
      expect(result!.title).toBe("Updated");
    });

    it("should return null on error", async () => {
      mockPrisma.adminCoupon.update.mockRejectedValue(new Error("not found"));
      const result = await updateCoupon("nonexistent", { title: "X" });
      expect(result).toBeNull();
    });

    it("should handle numeric discount update", async () => {
      mockPrisma.adminCoupon.update.mockResolvedValue(makeCouponRow({ discount: 20 }));
      const result = await updateCoupon("coupon-1", { discount: 20 });
      expect(result).not.toBeNull();
      expect(result!.discount).toBe(20);
    });

    it("should handle null discount update", async () => {
      mockPrisma.adminCoupon.update.mockResolvedValue(makeCouponRow({ discount: null }));
      const result = await updateCoupon("coupon-1", { discount: null as unknown as undefined });
      expect(result).not.toBeNull();
    });

    it("should handle numeric minSpend update", async () => {
      mockPrisma.adminCoupon.update.mockResolvedValue(makeCouponRow({ minSpend: 100 }));
      const result = await updateCoupon("coupon-1", { minSpend: 100 });
      expect(result).not.toBeNull();
    });

    it("should handle null minSpend update", async () => {
      mockPrisma.adminCoupon.update.mockResolvedValue(makeCouponRow({ minSpend: null }));
      const result = await updateCoupon("coupon-1", { minSpend: null as unknown as undefined });
      expect(result).not.toBeNull();
    });

    it("should handle startsAt update", async () => {
      const date = new Date("2026-03-01");
      mockPrisma.adminCoupon.update.mockResolvedValue(makeCouponRow({ startsAt: date }));
      const result = await updateCoupon("coupon-1", { startsAt: date.getTime() });
      expect(result).not.toBeNull();
    });

    it("should handle null startsAt update", async () => {
      mockPrisma.adminCoupon.update.mockResolvedValue(makeCouponRow({ startsAt: null }));
      const result = await updateCoupon("coupon-1", { startsAt: null as unknown as undefined });
      expect(result).not.toBeNull();
    });

    it("should handle expiresAt update", async () => {
      const date = new Date("2026-12-31");
      mockPrisma.adminCoupon.update.mockResolvedValue(makeCouponRow({ expiresAt: date }));
      const result = await updateCoupon("coupon-1", { expiresAt: date.getTime() });
      expect(result).not.toBeNull();
    });

    it("should handle null expiresAt update", async () => {
      mockPrisma.adminCoupon.update.mockResolvedValue(makeCouponRow({ expiresAt: null }));
      const result = await updateCoupon("coupon-1", { expiresAt: null as unknown as undefined });
      expect(result).not.toBeNull();
    });
  });

  describe("removeCoupon", () => {
    it("should return true on success", async () => {
      mockPrisma.adminCoupon.update.mockResolvedValue({});
      const result = await removeCoupon("coupon-1");
      expect(result).toBe(true);
    });

    it("should return false on error", async () => {
      mockPrisma.adminCoupon.update.mockRejectedValue(new Error("not found"));
      const result = await removeCoupon("nonexistent");
      expect(result).toBe(false);
    });
  });
});
