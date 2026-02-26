import { describe, it, expect, vi, beforeEach } from "vitest";

const mockBatchCreate = vi.fn();
const mockCodeCreateMany = vi.fn();
const mockCodeFindMany = vi.fn();
const mockCodeCount = vi.fn();
const mockCodeUpdate = vi.fn();
const mockCodeFindUnique = vi.fn();
const mockRecordCount = vi.fn();
const mockRecordFindMany = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  prisma: {
    redeemBatch: {
      create: (...args: unknown[]) => mockBatchCreate(...args),
    },
    redeemCode: {
      createMany: (...args: unknown[]) => mockCodeCreateMany(...args),
      findMany: (...args: unknown[]) => mockCodeFindMany(...args),
      count: (...args: unknown[]) => mockCodeCount(...args),
      update: (...args: unknown[]) => mockCodeUpdate(...args),
      findUnique: (...args: unknown[]) => mockCodeFindUnique(...args),
    },
    redeemRecord: {
      count: (...args: unknown[]) => mockRecordCount(...args),
      findMany: (...args: unknown[]) => mockRecordFindMany(...args),
    },
  },
}));

vi.mock("@prisma/client", () => ({
  Prisma: {
    DbNull: "DbNull",
  },
}));

import {
  normalizeRedeemCode,
  createRedeemBatch,
  createRedeemCodes,
  queryRedeemCodes,
  queryRedeemRecords,
  updateRedeemCodeStatus,
  getRedeemCodeByCode,
} from "../redeem-store";

beforeEach(() => {
  vi.clearAllMocks();
});

const now = new Date("2026-01-15T10:00:00Z");

const baseBatchRow = {
  id: "BATCH-1",
  title: "新年活动",
  description: null,
  rewardType: "mantou",
  rewardPayload: null,
  status: "active",
  maxRedeem: 100,
  maxRedeemPerUser: 1,
  totalCodes: 50,
  usedCount: 0,
  startsAt: null,
  expiresAt: null,
  createdAt: now,
  updatedAt: null,
};

const baseCodeRow = {
  id: "RCD-1",
  batchId: "BATCH-1",
  code: "NEWYEAR2026",
  status: "active",
  maxRedeem: 100,
  maxRedeemPerUser: 1,
  usedCount: 0,
  rewardType: "mantou",
  rewardPayload: null,
  startsAt: null,
  expiresAt: null,
  note: null,
  createdAt: now,
  updatedAt: null,
  lastRedeemedAt: null,
};

const baseRecordRow = {
  id: "RR-1",
  codeId: "RCD-1",
  batchId: "BATCH-1",
  userAddress: "0xuser1",
  rewardType: "mantou",
  rewardPayload: null,
  status: "success",
  createdAt: now,
  ip: null,
  userAgent: null,
  meta: null,
};

// ---- normalizeRedeemCode ----

describe("normalizeRedeemCode", () => {
  it("removes spaces and dashes, uppercases", () => {
    expect(normalizeRedeemCode("abc-def 123")).toBe("ABCDEF123");
  });

  it("handles already normalized code", () => {
    expect(normalizeRedeemCode("ABCDEF")).toBe("ABCDEF");
  });

  it("handles empty string", () => {
    expect(normalizeRedeemCode("")).toBe("");
  });
});

// ---- createRedeemBatch ----

describe("createRedeemBatch", () => {
  it("creates a batch", async () => {
    mockBatchCreate.mockResolvedValue(baseBatchRow);

    const result = await createRedeemBatch({
      id: "BATCH-1",
      title: "新年活动",
      rewardType: "mantou",
      status: "active",
    });

    expect(result.id).toBe("BATCH-1");
    expect(result.title).toBe("新年活动");
    expect(result.rewardType).toBe("mantou");
    expect(mockBatchCreate).toHaveBeenCalledTimes(1);
  });

  it("creates a batch with all optional fields", async () => {
    const startsAt = new Date("2026-01-01");
    const expiresAt = new Date("2026-12-31");
    const updatedAt = new Date("2026-02-01");
    mockBatchCreate.mockResolvedValue({
      ...baseBatchRow,
      description: "活动描述",
      rewardPayload: { amount: 100 },
      startsAt,
      expiresAt,
      updatedAt,
    });

    const result = await createRedeemBatch({
      id: "BATCH-2",
      title: "活动",
      rewardType: "mantou",
      status: "active",
      description: "活动描述",
      rewardPayload: { amount: 100 },
      startsAt,
      expiresAt,
    });

    expect(result.description).toBe("活动描述");
    expect(result.rewardPayload).toEqual({ amount: 100 });
    expect(result.startsAt).toBe(startsAt.getTime());
    expect(result.expiresAt).toBe(expiresAt.getTime());
    expect(result.updatedAt).toBe(updatedAt.getTime());
  });

  it("handles batch with null optional fields", async () => {
    mockBatchCreate.mockResolvedValue({
      ...baseBatchRow,
      description: null,
      rewardPayload: null,
      startsAt: null,
      expiresAt: null,
      updatedAt: null,
    });

    const result = await createRedeemBatch({
      id: "BATCH-3",
      title: "基础",
      rewardType: "mantou",
      status: "active",
    });

    expect(result.description).toBeUndefined();
    expect(result.rewardPayload).toBeUndefined();
    expect(result.startsAt).toBeNull();
    expect(result.expiresAt).toBeNull();
    expect(result.updatedAt).toBeUndefined();
  });
});

// ---- createRedeemCodes ----

describe("createRedeemCodes", () => {
  it("creates codes and returns them", async () => {
    mockCodeCreateMany.mockResolvedValue({ count: 2 });
    mockCodeFindMany.mockResolvedValue([
      baseCodeRow,
      { ...baseCodeRow, id: "RCD-2", code: "CODE2" },
    ]);

    const result = await createRedeemCodes({
      codes: ["NEWYEAR2026", "CODE2"],
      status: "active",
      maxRedeem: 100,
      maxRedeemPerUser: 1,
    });

    expect(result).toHaveLength(2);
    expect(mockCodeCreateMany).toHaveBeenCalledTimes(1);
  });

  it("returns empty array for empty codes", async () => {
    const result = await createRedeemCodes({
      codes: [],
      status: "active",
      maxRedeem: 100,
      maxRedeemPerUser: 1,
    });

    expect(result).toEqual([]);
    expect(mockCodeCreateMany).not.toHaveBeenCalled();
  });

  it("handles code with all optional fields set", async () => {
    const startsAt = new Date("2026-01-01");
    const expiresAt = new Date("2026-12-31");
    const updatedAt = new Date("2026-02-01");
    const lastRedeemedAt = new Date("2026-03-01");
    mockCodeCreateMany.mockResolvedValue({ count: 1 });
    mockCodeFindMany.mockResolvedValue([
      {
        ...baseCodeRow,
        rewardType: "diamond",
        rewardPayload: { amount: 50 },
        startsAt,
        expiresAt,
        note: "test note",
        updatedAt,
        lastRedeemedAt,
      },
    ]);

    const result = await createRedeemCodes({
      codes: ["CODE1"],
      status: "active",
      maxRedeem: 100,
      maxRedeemPerUser: 1,
      rewardType: "diamond",
      rewardPayload: { amount: 50 },
      startsAt,
      expiresAt,
      note: "test note",
    });

    expect(result[0].rewardType).toBe("diamond");
    expect(result[0].rewardPayload).toEqual({ amount: 50 });
    expect(result[0].startsAt).toBe(startsAt.getTime());
    expect(result[0].expiresAt).toBe(expiresAt.getTime());
    expect(result[0].note).toBe("test note");
    expect(result[0].updatedAt).toBe(updatedAt.getTime());
    expect(result[0].lastRedeemedAt).toBe(lastRedeemedAt.getTime());
  });

  it("handles code with null optional fields", async () => {
    mockCodeCreateMany.mockResolvedValue({ count: 1 });
    mockCodeFindMany.mockResolvedValue([
      {
        ...baseCodeRow,
        batchId: null,
        rewardType: null,
        rewardPayload: null,
        startsAt: null,
        expiresAt: null,
        note: null,
        updatedAt: null,
        lastRedeemedAt: null,
      },
    ]);

    const result = await createRedeemCodes({
      codes: ["CODE2"],
      status: "active",
      maxRedeem: 100,
      maxRedeemPerUser: 1,
    });

    expect(result[0].batchId).toBeUndefined();
    expect(result[0].rewardType).toBeUndefined();
    expect(result[0].rewardPayload).toBeUndefined();
    expect(result[0].startsAt).toBeNull();
    expect(result[0].expiresAt).toBeNull();
    expect(result[0].note).toBeUndefined();
    expect(result[0].updatedAt).toBeUndefined();
    expect(result[0].lastRedeemedAt).toBeUndefined();
  });
});

// ---- queryRedeemCodes ----

describe("queryRedeemCodes", () => {
  it("returns paginated codes", async () => {
    mockCodeCount.mockResolvedValue(25);
    mockCodeFindMany.mockResolvedValue([{ ...baseCodeRow, batch: baseBatchRow }]);

    const result = await queryRedeemCodes({ page: 1, pageSize: 10 });
    expect(result.total).toBe(25);
    expect(result.totalPages).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].code).toBe("NEWYEAR2026");
    expect(result.items[0].batch).toBeDefined();
  });

  it("filters by status", async () => {
    mockCodeCount.mockResolvedValue(5);
    mockCodeFindMany.mockResolvedValue([]);

    await queryRedeemCodes({ page: 1, pageSize: 10, status: "active" });
    expect(mockCodeCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "active" }) })
    );
  });

  it("filters by batchId", async () => {
    mockCodeCount.mockResolvedValue(3);
    mockCodeFindMany.mockResolvedValue([]);

    await queryRedeemCodes({ page: 1, pageSize: 10, batchId: "BATCH-1" });
    expect(mockCodeCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ batchId: "BATCH-1" }) })
    );
  });

  it("filters by keyword", async () => {
    mockCodeCount.mockResolvedValue(1);
    mockCodeFindMany.mockResolvedValue([]);

    await queryRedeemCodes({ page: 1, pageSize: 10, q: "NEWYEAR" });
    expect(mockCodeCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) })
    );
  });

  it("clamps page to valid range", async () => {
    mockCodeCount.mockResolvedValue(5);
    mockCodeFindMany.mockResolvedValue([]);

    const result = await queryRedeemCodes({ page: 999, pageSize: 10 });
    expect(result.page).toBe(1);
  });
});

// ---- queryRedeemRecords ----

describe("queryRedeemRecords", () => {
  it("returns paginated records", async () => {
    mockRecordCount.mockResolvedValue(10);
    mockRecordFindMany.mockResolvedValue([
      { ...baseRecordRow, code: { code: "NEWYEAR2026" }, batch: { title: "新年活动" } },
    ]);

    const result = await queryRedeemRecords({ page: 1, pageSize: 10 });
    expect(result.total).toBe(10);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].code).toBe("NEWYEAR2026");
    expect(result.items[0].batchTitle).toBe("新年活动");
  });

  it("handles records with all optional fields set", async () => {
    mockRecordCount.mockResolvedValue(1);
    mockRecordFindMany.mockResolvedValue([
      {
        ...baseRecordRow,
        batchId: "BATCH-1",
        rewardPayload: { amount: 100 },
        ip: "1.2.3.4",
        userAgent: "Mozilla/5.0",
        meta: { source: "web" },
        code: { code: "CODE1" },
        batch: { title: "活动" },
      },
    ]);

    const result = await queryRedeemRecords({ page: 1, pageSize: 10 });
    expect(result.items[0].batchId).toBe("BATCH-1");
    expect(result.items[0].rewardPayload).toEqual({ amount: 100 });
    expect(result.items[0].ip).toBe("1.2.3.4");
    expect(result.items[0].userAgent).toBe("Mozilla/5.0");
    expect(result.items[0].meta).toEqual({ source: "web" });
  });

  it("handles records with null optional fields", async () => {
    mockRecordCount.mockResolvedValue(1);
    mockRecordFindMany.mockResolvedValue([
      {
        ...baseRecordRow,
        batchId: null,
        rewardPayload: null,
        ip: null,
        userAgent: null,
        meta: null,
        code: null,
        batch: null,
      },
    ]);

    const result = await queryRedeemRecords({ page: 1, pageSize: 10 });
    expect(result.items[0].batchId).toBeUndefined();
    expect(result.items[0].rewardPayload).toBeUndefined();
    expect(result.items[0].ip).toBeUndefined();
    expect(result.items[0].userAgent).toBeUndefined();
    expect(result.items[0].meta).toBeUndefined();
  });

  it("filters by address", async () => {
    mockRecordCount.mockResolvedValue(2);
    mockRecordFindMany.mockResolvedValue([]);

    await queryRedeemRecords({ page: 1, pageSize: 10, address: "0xuser1" });
    expect(mockRecordCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userAddress: "0xuser1" }) })
    );
  });

  it("filters by keyword", async () => {
    mockRecordCount.mockResolvedValue(1);
    mockRecordFindMany.mockResolvedValue([]);

    await queryRedeemRecords({ page: 1, pageSize: 10, q: "0xuser" });
    expect(mockRecordCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ OR: expect.any(Array) }) })
    );
  });

  it("filters by codeId and batchId", async () => {
    mockRecordCount.mockResolvedValue(1);
    mockRecordFindMany.mockResolvedValue([]);

    await queryRedeemRecords({ page: 1, pageSize: 10, codeId: "RCD-1", batchId: "BATCH-1" });
    expect(mockRecordCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ codeId: "RCD-1", batchId: "BATCH-1" }),
      })
    );
  });

  it("filters by status", async () => {
    mockRecordCount.mockResolvedValue(1);
    mockRecordFindMany.mockResolvedValue([]);

    await queryRedeemRecords({ page: 1, pageSize: 10, status: "success" });
    expect(mockRecordCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "success" }) })
    );
  });
});

// ---- updateRedeemCodeStatus ----

describe("updateRedeemCodeStatus", () => {
  it("updates code status", async () => {
    mockCodeUpdate.mockResolvedValue({ ...baseCodeRow, status: "disabled" });

    const result = await updateRedeemCodeStatus("RCD-1", "disabled");
    expect(result).not.toBeNull();
    expect(result!.status).toBe("disabled");
  });

  it("returns null on error", async () => {
    mockCodeUpdate.mockRejectedValue(new Error("not found"));

    const result = await updateRedeemCodeStatus("RCD-999", "disabled");
    expect(result).toBeNull();
  });
});

// ---- getRedeemCodeByCode ----

describe("getRedeemCodeByCode", () => {
  it("returns code with batch when found", async () => {
    mockCodeFindUnique.mockResolvedValue({ ...baseCodeRow, batch: baseBatchRow });

    const result = await getRedeemCodeByCode("NEWYEAR2026");
    expect(result).not.toBeNull();
    expect(result!.code.code).toBe("NEWYEAR2026");
    expect(result!.batch).not.toBeNull();
  });

  it("returns null when not found", async () => {
    mockCodeFindUnique.mockResolvedValue(null);

    const result = await getRedeemCodeByCode("NONEXISTENT");
    expect(result).toBeNull();
  });

  it("returns null batch when code has no batch", async () => {
    mockCodeFindUnique.mockResolvedValue({ ...baseCodeRow, batch: null, batchId: null });

    const result = await getRedeemCodeByCode("NEWYEAR2026");
    expect(result).not.toBeNull();
    expect(result!.batch).toBeNull();
  });
});
