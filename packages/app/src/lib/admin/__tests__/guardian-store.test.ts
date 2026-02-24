import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPrisma = vi.hoisted(() => ({
  adminGuardianApplication: {
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
  queryGuardianApplications,
  queryGuardianApplicationsCursor,
  isApprovedGuardianAddress,
  addGuardianApplication,
  updateGuardianApplication,
  removeGuardianApplication,
} from "../guardian-store";

function makeGuardianRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "guardian-1",
    user: "user1",
    userAddress: "0xGUARD",
    contact: "wechat123",
    games: "王者荣耀",
    experience: "3年",
    availability: "全天",
    status: "待审核",
    note: null,
    meta: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: null,
    ...overrides,
  };
}

describe("guardian-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("queryGuardianApplications", () => {
    it("should paginate and return total info", async () => {
      mockPrisma.adminGuardianApplication.count.mockResolvedValue(20);
      mockPrisma.adminGuardianApplication.findMany.mockResolvedValue([makeGuardianRow()]);
      const result = await queryGuardianApplications({ page: 1, pageSize: 10 });
      expect(result.total).toBe(20);
      expect(result.totalPages).toBe(2);
      expect(result.items).toHaveLength(1);
    });

    it("should filter by status", async () => {
      mockPrisma.adminGuardianApplication.count.mockResolvedValue(0);
      mockPrisma.adminGuardianApplication.findMany.mockResolvedValue([]);
      await queryGuardianApplications({ page: 1, pageSize: 10, status: "已通过" });
      const call = mockPrisma.adminGuardianApplication.count.mock.calls[0][0];
      expect(call.where.status).toBe("已通过");
    });

    it("should not filter status when '全部'", async () => {
      mockPrisma.adminGuardianApplication.count.mockResolvedValue(0);
      mockPrisma.adminGuardianApplication.findMany.mockResolvedValue([]);
      await queryGuardianApplications({ page: 1, pageSize: 10, status: "全部" });
      const call = mockPrisma.adminGuardianApplication.count.mock.calls[0][0];
      expect(call.where.status).toBeUndefined();
    });

    it("should filter by keyword", async () => {
      mockPrisma.adminGuardianApplication.count.mockResolvedValue(0);
      mockPrisma.adminGuardianApplication.findMany.mockResolvedValue([]);
      await queryGuardianApplications({ page: 1, pageSize: 10, q: "王者" });
      const call = mockPrisma.adminGuardianApplication.count.mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toHaveLength(5);
    });
  });

  describe("queryGuardianApplicationsCursor", () => {
    it("should return items and nextCursor when hasMore", async () => {
      const rows = [makeGuardianRow({ id: "g1" }), makeGuardianRow({ id: "g2" })];
      mockPrisma.adminGuardianApplication.findMany.mockResolvedValue(rows);
      const result = await queryGuardianApplicationsCursor({ pageSize: 1 });
      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeDefined();
    });

    it("should return null nextCursor when no more", async () => {
      mockPrisma.adminGuardianApplication.findMany.mockResolvedValue([makeGuardianRow()]);
      const result = await queryGuardianApplicationsCursor({ pageSize: 5 });
      expect(result.nextCursor).toBeNull();
    });

    it("should filter by keyword", async () => {
      mockPrisma.adminGuardianApplication.findMany.mockResolvedValue([]);
      await queryGuardianApplicationsCursor({ pageSize: 10, q: "王者" });
      const call = mockPrisma.adminGuardianApplication.findMany.mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toHaveLength(5);
    });

    it("should filter by status", async () => {
      mockPrisma.adminGuardianApplication.findMany.mockResolvedValue([]);
      await queryGuardianApplicationsCursor({ pageSize: 10, status: "已通过" });
      const call = mockPrisma.adminGuardianApplication.findMany.mock.calls[0][0];
      expect(call.where.status).toBe("已通过");
    });

    it("should not filter status when '全部'", async () => {
      mockPrisma.adminGuardianApplication.findMany.mockResolvedValue([]);
      await queryGuardianApplicationsCursor({ pageSize: 10, status: "全部" });
      const call = mockPrisma.adminGuardianApplication.findMany.mock.calls[0][0];
      expect(call.where.status).toBeUndefined();
    });
  });

  describe("isApprovedGuardianAddress", () => {
    it("should return true when approved application exists", async () => {
      mockPrisma.adminGuardianApplication.findFirst.mockResolvedValue({ id: "g1" });
      const result = await isApprovedGuardianAddress("0xGUARD");
      expect(result).toBe(true);
    });

    it("should return false when no approved application", async () => {
      mockPrisma.adminGuardianApplication.findFirst.mockResolvedValue(null);
      const result = await isApprovedGuardianAddress("0xGUARD");
      expect(result).toBe(false);
    });

    it("should return false for empty address", async () => {
      const result = await isApprovedGuardianAddress("");
      expect(result).toBe(false);
    });
  });

  describe("addGuardianApplication", () => {
    it("should create and return mapped application", async () => {
      mockPrisma.adminGuardianApplication.create.mockResolvedValue(makeGuardianRow());
      const app = {
        id: "guardian-1",
        user: "user1",
        status: "待审核" as const,
        createdAt: Date.now(),
      };
      const result = await addGuardianApplication(app);
      expect(result.id).toBe("guardian-1");
      expect(mockPrisma.adminGuardianApplication.create).toHaveBeenCalled();
    });

    it("should handle application with all null optional fields", async () => {
      mockPrisma.adminGuardianApplication.create.mockResolvedValue(
        makeGuardianRow({
          user: null,
          userAddress: null,
          contact: null,
          games: null,
          experience: null,
          availability: null,
          note: null,
          meta: null,
          updatedAt: null,
        })
      );
      const app = {
        id: "guardian-2",
        status: "待审核" as const,
        createdAt: Date.now(),
      };
      const result = await addGuardianApplication(app);
      expect(result.user).toBeUndefined();
      expect(result.userAddress).toBeUndefined();
      expect(result.contact).toBeUndefined();
      expect(result.games).toBeUndefined();
      expect(result.experience).toBeUndefined();
      expect(result.availability).toBeUndefined();
      expect(result.note).toBeUndefined();
      expect(result.meta).toBeUndefined();
      expect(result.updatedAt).toBeUndefined();
    });

    it("should handle application with meta and updatedAt set", async () => {
      const updatedDate = new Date("2026-02-01");
      mockPrisma.adminGuardianApplication.create.mockResolvedValue(
        makeGuardianRow({ meta: { source: "web" }, updatedAt: updatedDate })
      );
      const app = {
        id: "guardian-3",
        status: "待审核" as const,
        createdAt: Date.now(),
        meta: { source: "web" },
        updatedAt: updatedDate.getTime(),
      };
      const result = await addGuardianApplication(app);
      expect(result.meta).toEqual({ source: "web" });
      expect(result.updatedAt).toBe(updatedDate.getTime());
    });
  });

  describe("updateGuardianApplication", () => {
    it("should update and return mapped application", async () => {
      mockPrisma.adminGuardianApplication.update.mockResolvedValue(
        makeGuardianRow({ status: "已通过" })
      );
      const result = await updateGuardianApplication("guardian-1", { status: "已通过" });
      expect(result).not.toBeNull();
      expect(result!.status).toBe("已通过");
    });

    it("should return null on error", async () => {
      mockPrisma.adminGuardianApplication.update.mockRejectedValue(new Error("not found"));
      const result = await updateGuardianApplication("nonexistent", { status: "已通过" });
      expect(result).toBeNull();
    });
  });

  describe("removeGuardianApplication", () => {
    it("should return true on success", async () => {
      mockPrisma.adminGuardianApplication.delete.mockResolvedValue({});
      const result = await removeGuardianApplication("guardian-1");
      expect(result).toBe(true);
    });

    it("should return false on error", async () => {
      mockPrisma.adminGuardianApplication.delete.mockRejectedValue(new Error("not found"));
      const result = await removeGuardianApplication("nonexistent");
      expect(result).toBe(false);
    });
  });
});
