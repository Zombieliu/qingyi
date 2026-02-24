import { describe, it, expect, vi, beforeEach } from "vitest";

const mockAuditCreate = vi.fn();
const mockAuditCount = vi.fn();
const mockAuditFindMany = vi.fn();
const mockAuditDeleteMany = vi.fn();
const mockPaymentCreate = vi.fn();
const mockPaymentCount = vi.fn();
const mockPaymentFindMany = vi.fn();
const mockPaymentDeleteMany = vi.fn();

vi.mock("../admin-store-utils", () => ({
  prisma: {
    adminAuditLog: {
      create: (...args: unknown[]) => mockAuditCreate(...args),
      count: (...args: unknown[]) => mockAuditCount(...args),
      findMany: (...args: unknown[]) => mockAuditFindMany(...args),
      deleteMany: (...args: unknown[]) => mockAuditDeleteMany(...args),
    },
    adminPaymentEvent: {
      create: (...args: unknown[]) => mockPaymentCreate(...args),
      count: (...args: unknown[]) => mockPaymentCount(...args),
      findMany: (...args: unknown[]) => mockPaymentFindMany(...args),
      deleteMany: (...args: unknown[]) => mockPaymentDeleteMany(...args),
    },
  },
  Prisma: {
    DbNull: "DbNull",
  },
  appendCursorWhere: vi.fn(),
  buildCursorPayload: vi.fn().mockReturnValue({ id: "x", createdAt: 0 }),
}));

vi.mock("@/lib/env", () => ({
  env: {
    ADMIN_AUDIT_LOG_LIMIT: 100,
    ADMIN_PAYMENT_EVENT_LIMIT: 100,
  },
}));

import {
  addAuditLog,
  queryAuditLogs,
  queryAuditLogsCursor,
  addPaymentEvent,
  queryPaymentEvents,
  queryPaymentEventsCursor,
} from "../audit-store";

beforeEach(() => {
  vi.clearAllMocks();
});

const now = new Date("2026-01-15T10:00:00Z");

const baseAuditRow = {
  id: "AUDIT-1",
  actorRole: "admin",
  actorSessionId: "SES-1",
  action: "create_order",
  targetType: "order",
  targetId: "ORD-1",
  meta: null,
  ip: "127.0.0.1",
  createdAt: now,
};

const basePaymentRow = {
  id: "PAY-1",
  provider: "stripe",
  event: "payment_intent.succeeded",
  orderNo: "ORD-1",
  amount: 99.9,
  status: "succeeded",
  verified: true,
  createdAt: now,
  raw: null,
};

// ---- Audit Logs ----

describe("addAuditLog", () => {
  it("creates an audit log entry", async () => {
    mockAuditCreate.mockResolvedValue(baseAuditRow);
    mockAuditCount.mockResolvedValue(50);

    const result = await addAuditLog({
      id: "AUDIT-1",
      actorRole: "admin",
      actorSessionId: "SES-1",
      action: "create_order",
      targetType: "order",
      targetId: "ORD-1",
      ip: "127.0.0.1",
      createdAt: now.getTime(),
    });

    expect(result.id).toBe("AUDIT-1");
    expect(result.action).toBe("create_order");
    expect(mockAuditCreate).toHaveBeenCalledTimes(1);
  });

  it("trims excess logs when over limit", async () => {
    mockAuditCreate.mockResolvedValue(baseAuditRow);
    mockAuditCount.mockResolvedValue(105);
    mockAuditFindMany.mockResolvedValue([{ id: "OLD-1" }, { id: "OLD-2" }]);
    mockAuditDeleteMany.mockResolvedValue({ count: 2 });

    await addAuditLog({
      id: "AUDIT-2",
      actorRole: "admin",
      action: "test",
      createdAt: now.getTime(),
    });

    expect(mockAuditDeleteMany).toHaveBeenCalled();
  });

  it("does not trim when under limit", async () => {
    mockAuditCreate.mockResolvedValue(baseAuditRow);
    mockAuditCount.mockResolvedValue(50);

    await addAuditLog({
      id: "AUDIT-3",
      actorRole: "admin",
      action: "test",
      createdAt: now.getTime(),
    });

    expect(mockAuditDeleteMany).not.toHaveBeenCalled();
  });

  it("maps meta field when present", async () => {
    const rowWithMeta = { ...baseAuditRow, meta: { key: "value" } };
    mockAuditCreate.mockResolvedValue(rowWithMeta);
    mockAuditCount.mockResolvedValue(10);

    const result = await addAuditLog({
      id: "AUDIT-4",
      actorRole: "admin",
      action: "test",
      meta: { key: "value" },
      createdAt: now.getTime(),
    });

    expect(result.meta).toEqual({ key: "value" });
  });

  it("maps null optional fields to undefined", async () => {
    const minimalRow = {
      ...baseAuditRow,
      actorSessionId: null,
      targetType: null,
      targetId: null,
      meta: null,
      ip: null,
    };
    mockAuditCreate.mockResolvedValue(minimalRow);
    mockAuditCount.mockResolvedValue(10);

    const result = await addAuditLog({
      id: "AUDIT-5",
      actorRole: "admin",
      action: "test",
      createdAt: now.getTime(),
    });

    expect(result.actorSessionId).toBeUndefined();
    expect(result.targetType).toBeUndefined();
    expect(result.targetId).toBeUndefined();
    expect(result.meta).toBeUndefined();
    expect(result.ip).toBeUndefined();
  });

  it("does not delete when excess findMany returns empty", async () => {
    mockAuditCreate.mockResolvedValue(baseAuditRow);
    mockAuditCount.mockResolvedValue(105);
    mockAuditFindMany.mockResolvedValue([]);

    await addAuditLog({
      id: "AUDIT-6",
      actorRole: "admin",
      action: "test",
      createdAt: now.getTime(),
    });

    expect(mockAuditDeleteMany).not.toHaveBeenCalled();
  });
});

describe("queryAuditLogs", () => {
  it("returns paginated audit logs", async () => {
    mockAuditCount.mockResolvedValue(25);
    mockAuditFindMany.mockResolvedValue([baseAuditRow]);

    const result = await queryAuditLogs({ page: 1, pageSize: 10 });
    expect(result.total).toBe(25);
    expect(result.totalPages).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].action).toBe("create_order");
  });

  it("filters by keyword", async () => {
    mockAuditCount.mockResolvedValue(1);
    mockAuditFindMany.mockResolvedValue([baseAuditRow]);

    await queryAuditLogs({ page: 1, pageSize: 10, q: "create" });
    expect(mockAuditCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) })
    );
  });

  it("clamps page to valid range", async () => {
    mockAuditCount.mockResolvedValue(5);
    mockAuditFindMany.mockResolvedValue([]);

    const result = await queryAuditLogs({ page: 999, pageSize: 10 });
    expect(result.page).toBe(1);
  });
});

describe("queryAuditLogsCursor", () => {
  it("returns items with nextCursor when hasMore", async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      ...baseAuditRow,
      id: `AUDIT-${i}`,
    }));
    mockAuditFindMany.mockResolvedValue(rows);

    const result = await queryAuditLogsCursor({ pageSize: 10 });
    expect(result.items).toHaveLength(10);
    expect(result.nextCursor).not.toBeNull();
  });

  it("returns null nextCursor when no more", async () => {
    mockAuditFindMany.mockResolvedValue([baseAuditRow]);

    const result = await queryAuditLogsCursor({ pageSize: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("filters by keyword in cursor mode", async () => {
    mockAuditFindMany.mockResolvedValue([baseAuditRow]);

    const result = await queryAuditLogsCursor({ pageSize: 10, q: "create" });
    expect(result.items).toHaveLength(1);
  });

  it("handles empty keyword (whitespace only)", async () => {
    mockAuditFindMany.mockResolvedValue([baseAuditRow]);

    const result = await queryAuditLogsCursor({ pageSize: 10, q: "  " });
    expect(result.items).toHaveLength(1);
  });
});

// ---- Payment Events ----

describe("addPaymentEvent", () => {
  it("creates a payment event", async () => {
    mockPaymentCreate.mockResolvedValue(basePaymentRow);
    mockPaymentCount.mockResolvedValue(50);

    const result = await addPaymentEvent({
      id: "PAY-1",
      provider: "stripe",
      event: "payment_intent.succeeded",
      orderNo: "ORD-1",
      amount: 99.9,
      status: "succeeded",
      verified: true,
      createdAt: now.getTime(),
    });

    expect(result.id).toBe("PAY-1");
    expect(result.provider).toBe("stripe");
    expect(result.verified).toBe(true);
  });

  it("trims excess payment events when over limit", async () => {
    mockPaymentCreate.mockResolvedValue(basePaymentRow);
    mockPaymentCount.mockResolvedValue(110);
    mockPaymentFindMany.mockResolvedValue([{ id: "OLD-1" }]);
    mockPaymentDeleteMany.mockResolvedValue({ count: 1 });

    await addPaymentEvent({
      id: "PAY-2",
      provider: "stripe",
      event: "test",
      verified: false,
      createdAt: now.getTime(),
    });

    expect(mockPaymentDeleteMany).toHaveBeenCalled();
  });

  it("maps null optional fields to undefined", async () => {
    const minimalPaymentRow = {
      ...basePaymentRow,
      orderNo: null,
      amount: null,
      status: null,
      raw: null,
    };
    mockPaymentCreate.mockResolvedValue(minimalPaymentRow);
    mockPaymentCount.mockResolvedValue(10);

    const result = await addPaymentEvent({
      id: "PAY-3",
      provider: "stripe",
      event: "test",
      verified: false,
      createdAt: now.getTime(),
    });

    expect(result.orderNo).toBeUndefined();
    expect(result.amount).toBeUndefined();
    expect(result.status).toBeUndefined();
    expect(result.raw).toBeUndefined();
  });

  it("maps raw field when present", async () => {
    const rowWithRaw = { ...basePaymentRow, raw: { key: "value" } };
    mockPaymentCreate.mockResolvedValue(rowWithRaw);
    mockPaymentCount.mockResolvedValue(10);

    const result = await addPaymentEvent({
      id: "PAY-4",
      provider: "stripe",
      event: "test",
      verified: true,
      raw: { key: "value" },
      createdAt: now.getTime(),
    });

    expect(result.raw).toEqual({ key: "value" });
  });

  it("does not delete when excess findMany returns empty", async () => {
    mockPaymentCreate.mockResolvedValue(basePaymentRow);
    mockPaymentCount.mockResolvedValue(110);
    mockPaymentFindMany.mockResolvedValue([]);

    await addPaymentEvent({
      id: "PAY-5",
      provider: "stripe",
      event: "test",
      verified: false,
      createdAt: now.getTime(),
    });

    expect(mockPaymentDeleteMany).not.toHaveBeenCalled();
  });
});

describe("queryPaymentEvents", () => {
  it("returns paginated payment events", async () => {
    mockPaymentCount.mockResolvedValue(15);
    mockPaymentFindMany.mockResolvedValue([basePaymentRow]);

    const result = await queryPaymentEvents({ page: 1, pageSize: 10 });
    expect(result.total).toBe(15);
    expect(result.totalPages).toBe(2);
    expect(result.items).toHaveLength(1);
  });
});

describe("queryPaymentEventsCursor", () => {
  it("returns cursor-based results", async () => {
    mockPaymentFindMany.mockResolvedValue([basePaymentRow]);

    const result = await queryPaymentEventsCursor({ pageSize: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("returns nextCursor when hasMore", async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      ...basePaymentRow,
      id: `PAY-${i}`,
    }));
    mockPaymentFindMany.mockResolvedValue(rows);

    const result = await queryPaymentEventsCursor({ pageSize: 10 });
    expect(result.items).toHaveLength(10);
    expect(result.nextCursor).not.toBeNull();
  });
});
