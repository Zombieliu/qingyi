import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCount = vi.fn();
const mockFindMany = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("../admin-store-utils", () => ({
  prisma: {
    adminSupportTicket: {
      count: (...args: unknown[]) => mockCount(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
  Prisma: {
    DbNull: "DbNull",
  },
  appendCursorWhere: vi.fn(),
  buildCursorPayload: vi.fn().mockReturnValue({ id: "x", createdAt: 0 }),
}));

import {
  querySupportTickets,
  querySupportTicketsCursor,
  addSupportTicket,
  updateSupportTicket,
  removeSupportTicket,
} from "../support-store";

beforeEach(() => {
  vi.clearAllMocks();
});

const now = new Date("2026-01-15T10:00:00Z");

const baseTicketRow = {
  id: "TK-1",
  userName: "Alice",
  userAddress: "0xuser1",
  contact: "alice@test.com",
  topic: "订单问题",
  message: "我的订单有问题",
  status: "待处理",
  note: null,
  reply: null,
  meta: null,
  createdAt: now,
  updatedAt: null,
};

describe("querySupportTickets", () => {
  it("returns paginated tickets", async () => {
    mockCount.mockResolvedValue(20);
    mockFindMany.mockResolvedValue([baseTicketRow]);

    const result = await querySupportTickets({ page: 1, pageSize: 10 });
    expect(result.total).toBe(20);
    expect(result.totalPages).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].message).toBe("我的订单有问题");
  });

  it("filters by status", async () => {
    mockCount.mockResolvedValue(5);
    mockFindMany.mockResolvedValue([]);

    await querySupportTickets({ page: 1, pageSize: 10, status: "处理中" });
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "处理中" }) })
    );
  });

  it("ignores status filter for 全部", async () => {
    mockCount.mockResolvedValue(10);
    mockFindMany.mockResolvedValue([]);

    await querySupportTickets({ page: 1, pageSize: 10, status: "全部" });
    const callArg = mockCount.mock.calls[0][0];
    expect(callArg.where.status).toBeUndefined();
  });

  it("filters by keyword", async () => {
    mockCount.mockResolvedValue(1);
    mockFindMany.mockResolvedValue([baseTicketRow]);

    await querySupportTickets({ page: 1, pageSize: 10, q: "订单" });
    expect(mockCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) })
    );
  });

  it("clamps page to valid range", async () => {
    mockCount.mockResolvedValue(5);
    mockFindMany.mockResolvedValue([]);

    const result = await querySupportTickets({ page: 999, pageSize: 10 });
    expect(result.page).toBe(1);
  });
});

describe("querySupportTicketsCursor", () => {
  it("returns items with nextCursor when hasMore", async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      ...baseTicketRow,
      id: `TK-${i}`,
    }));
    mockFindMany.mockResolvedValue(rows);

    const result = await querySupportTicketsCursor({ pageSize: 10 });
    expect(result.items).toHaveLength(10);
    expect(result.nextCursor).not.toBeNull();
  });

  it("returns null nextCursor when no more", async () => {
    mockFindMany.mockResolvedValue([baseTicketRow]);

    const result = await querySupportTicketsCursor({ pageSize: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("filters by keyword", async () => {
    mockFindMany.mockResolvedValue([]);

    await querySupportTicketsCursor({ pageSize: 10, q: "订单" });
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.OR).toBeDefined();
    expect(call.where.OR).toHaveLength(5);
  });

  it("filters by status", async () => {
    mockFindMany.mockResolvedValue([]);

    await querySupportTicketsCursor({ pageSize: 10, status: "处理中" });
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.status).toBe("处理中");
  });

  it("does not filter status for 全部", async () => {
    mockFindMany.mockResolvedValue([]);

    await querySupportTicketsCursor({ pageSize: 10, status: "全部" });
    const call = mockFindMany.mock.calls[0][0];
    expect(call.where.status).toBeUndefined();
  });
});

describe("addSupportTicket", () => {
  it("creates a new ticket", async () => {
    mockCreate.mockResolvedValue(baseTicketRow);

    const result = await addSupportTicket({
      id: "TK-1",
      userName: "Alice",
      userAddress: "0xuser1",
      contact: "alice@test.com",
      topic: "订单问题",
      message: "我的订单有问题",
      status: "待处理",
      createdAt: now.getTime(),
    });

    expect(result.id).toBe("TK-1");
    expect(result.status).toBe("待处理");
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("handles ticket with all null optional fields", async () => {
    mockCreate.mockResolvedValue({
      ...baseTicketRow,
      userName: null,
      userAddress: null,
      contact: null,
      topic: null,
      note: null,
      reply: null,
      meta: null,
      updatedAt: null,
    });

    const result = await addSupportTicket({
      id: "TK-2",
      message: "问题",
      status: "待处理",
      createdAt: now.getTime(),
    });

    expect(result.userName).toBeUndefined();
    expect(result.userAddress).toBeUndefined();
    expect(result.contact).toBeUndefined();
    expect(result.topic).toBeUndefined();
    expect(result.note).toBeUndefined();
    expect(result.reply).toBeUndefined();
    expect(result.meta).toBeUndefined();
    expect(result.updatedAt).toBeUndefined();
  });

  it("handles ticket with updatedAt and meta set", async () => {
    const updatedDate = new Date("2026-02-01");
    mockCreate.mockResolvedValue({
      ...baseTicketRow,
      updatedAt: updatedDate,
      meta: { priority: "high" },
    });

    const result = await addSupportTicket({
      id: "TK-3",
      message: "紧急",
      status: "待处理",
      createdAt: now.getTime(),
      updatedAt: updatedDate.getTime(),
      meta: { priority: "high" },
    });

    expect(result.updatedAt).toBe(updatedDate.getTime());
    expect(result.meta).toEqual({ priority: "high" });
  });
});

describe("updateSupportTicket", () => {
  it("updates ticket with reply", async () => {
    mockUpdate.mockResolvedValue({ ...baseTicketRow, status: "已完成", reply: "已处理" });

    const result = await updateSupportTicket("TK-1", { status: "已完成", reply: "已处理" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("已完成");
    expect(result!.reply).toBe("已处理");
  });

  it("updates ticket with meta", async () => {
    mockUpdate.mockResolvedValue({ ...baseTicketRow, meta: { resolved: true } });

    const result = await updateSupportTicket("TK-1", { meta: { resolved: true } });
    expect(result).not.toBeNull();
    expect(result!.meta).toEqual({ resolved: true });
  });

  it("returns null on error", async () => {
    mockUpdate.mockRejectedValue(new Error("not found"));

    const result = await updateSupportTicket("TK-999", { status: "已完成" });
    expect(result).toBeNull();
  });
});

describe("removeSupportTicket", () => {
  it("returns true on success", async () => {
    mockUpdate.mockResolvedValue(baseTicketRow);
    expect(await removeSupportTicket("TK-1")).toBe(true);
  });

  it("returns false on error", async () => {
    mockUpdate.mockRejectedValue(new Error("not found"));
    expect(await removeSupportTicket("TK-999")).toBe(false);
  });
});
