import { describe, it, expect, vi, beforeEach } from "vitest";

const mockUpsert = vi.fn();
const mockCount = vi.fn();
const mockFindMany = vi.fn();

vi.mock("../admin-store-utils", () => ({
  prisma: {
    ledgerRecord: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      count: (...args: unknown[]) => mockCount(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
  Prisma: {
    DbNull: "DbNull",
  },
}));

import { upsertLedgerRecord, queryLedgerRecords } from "../ledger-store";

beforeEach(() => {
  vi.clearAllMocks();
});

const now = new Date("2026-01-15T10:00:00Z");

const baseLedgerRow = {
  id: "LR-1",
  userAddress: "0xuser1",
  diamondAmount: 100,
  amount: 9.99,
  currency: "CNY",
  channel: "stripe",
  status: "completed",
  orderId: "ORD-1",
  receiptId: "REC-1",
  source: "purchase",
  note: "test note",
  meta: null,
  createdAt: now,
  updatedAt: null,
};

describe("upsertLedgerRecord", () => {
  it("creates a new ledger record", async () => {
    mockUpsert.mockResolvedValue(baseLedgerRow);

    const result = await upsertLedgerRecord({
      id: "LR-1",
      userAddress: "0xuser1",
      diamondAmount: 100,
      amount: 9.99,
      currency: "CNY",
      channel: "stripe",
      status: "completed",
      orderId: "ORD-1",
      receiptId: "REC-1",
      source: "purchase",
      note: "test note",
    });

    expect(result.id).toBe("LR-1");
    expect(result.userAddress).toBe("0xuser1");
    expect(result.diamondAmount).toBe(100);
    expect(result.amount).toBe(9.99);
    expect(result.createdAt).toBe(now.getTime());
    expect(mockUpsert).toHaveBeenCalledTimes(1);
  });

  it("maps null optional fields to undefined", async () => {
    mockUpsert.mockResolvedValue({
      ...baseLedgerRow,
      amount: null,
      currency: null,
      channel: null,
      orderId: null,
      receiptId: null,
      source: null,
      note: null,
      meta: null,
    });

    const result = await upsertLedgerRecord({
      id: "LR-2",
      userAddress: "0xuser2",
      diamondAmount: 50,
      status: "pending",
    });

    expect(result.amount).toBeUndefined();
    expect(result.currency).toBeUndefined();
    expect(result.channel).toBeUndefined();
    expect(result.orderId).toBeUndefined();
    expect(result.receiptId).toBeUndefined();
    expect(result.source).toBeUndefined();
    expect(result.note).toBeUndefined();
    expect(result.meta).toBeUndefined();
  });

  it("maps updatedAt when present", async () => {
    const updatedAt = new Date("2026-01-16T10:00:00Z");
    mockUpsert.mockResolvedValue({ ...baseLedgerRow, updatedAt });

    const result = await upsertLedgerRecord({
      id: "LR-1",
      userAddress: "0xuser1",
      diamondAmount: 100,
      status: "completed",
    });

    expect(result.updatedAt).toBe(updatedAt.getTime());
  });

  it("maps meta field when present", async () => {
    const meta = { key: "value" };
    mockUpsert.mockResolvedValue({ ...baseLedgerRow, meta });

    const result = await upsertLedgerRecord({
      id: "LR-1",
      userAddress: "0xuser1",
      diamondAmount: 100,
      status: "completed",
      meta,
    });

    expect(result.meta).toEqual({ key: "value" });
  });

  it("uses provided createdAt timestamp", async () => {
    const customCreatedAt = new Date("2026-01-10T00:00:00Z");
    mockUpsert.mockResolvedValue({ ...baseLedgerRow, createdAt: customCreatedAt });

    const result = await upsertLedgerRecord({
      id: "LR-1",
      userAddress: "0xuser1",
      diamondAmount: 100,
      status: "completed",
      createdAt: customCreatedAt.getTime(),
    });

    expect(result.createdAt).toBe(customCreatedAt.getTime());
  });
});

describe("queryLedgerRecords", () => {
  it("returns paginated results", async () => {
    mockCount.mockResolvedValue(25);
    mockFindMany.mockResolvedValue([baseLedgerRow]);

    const result = await queryLedgerRecords({ page: 1, pageSize: 10, address: "0xuser1" });

    expect(result.total).toBe(25);
    expect(result.totalPages).toBe(3);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(10);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("LR-1");
  });

  it("clamps page to valid range", async () => {
    mockCount.mockResolvedValue(5);
    mockFindMany.mockResolvedValue([]);

    const result = await queryLedgerRecords({ page: 100, pageSize: 10, address: "0xuser1" });

    expect(result.page).toBe(1);
    expect(result.totalPages).toBe(1);
  });

  it("returns empty items when no records", async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    const result = await queryLedgerRecords({ page: 1, pageSize: 10, address: "0xnobody" });

    expect(result.total).toBe(0);
    expect(result.items).toHaveLength(0);
    expect(result.totalPages).toBe(1);
  });
});
