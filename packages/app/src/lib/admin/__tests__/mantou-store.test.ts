import { describe, it, expect, vi, beforeEach } from "vitest";

const mockWalletFindUnique = vi.fn();
const mockWalletUpsert = vi.fn();
const mockTxCreate = vi.fn();
const mockTxFindFirst = vi.fn();
const mockTxCount = vi.fn();
const mockTxFindMany = vi.fn();
const mockWithdrawFindUnique = vi.fn();
const mockWithdrawCreate = vi.fn();
const mockWithdrawUpdate = vi.fn();
const mockWithdrawCount = vi.fn();
const mockWithdrawFindMany = vi.fn();
const mockTransaction = vi.fn();

vi.mock("../admin-store-utils", () => ({
  prisma: {
    mantouWallet: {
      findUnique: (...args: unknown[]) => mockWalletFindUnique(...args),
      upsert: (...args: unknown[]) => mockWalletUpsert(...args),
    },
    mantouTransaction: {
      create: (...args: unknown[]) => mockTxCreate(...args),
      findFirst: (...args: unknown[]) => mockTxFindFirst(...args),
      count: (...args: unknown[]) => mockTxCount(...args),
      findMany: (...args: unknown[]) => mockTxFindMany(...args),
    },
    mantouWithdrawRequest: {
      findUnique: (...args: unknown[]) => mockWithdrawFindUnique(...args),
      create: (...args: unknown[]) => mockWithdrawCreate(...args),
      update: (...args: unknown[]) => mockWithdrawUpdate(...args),
      count: (...args: unknown[]) => mockWithdrawCount(...args),
      findMany: (...args: unknown[]) => mockWithdrawFindMany(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
  Prisma: {},
  appendCursorWhere: vi.fn(),
  buildCursorPayload: vi.fn().mockReturnValue({ id: "x", createdAt: 0 }),
}));

import {
  getMantouWallet,
  creditMantou,
  requestMantouWithdraw,
  queryMantouWithdraws,
  queryMantouWithdrawsCursor,
  updateMantouWithdrawStatus,
  queryMantouTransactions,
} from "../mantou-store";

type MantouTxProxy = {
  mantouTransaction: {
    findFirst: typeof mockTxFindFirst;
    create: typeof mockTxCreate;
  };
  mantouWallet: {
    findUnique: typeof mockWalletFindUnique;
    upsert: typeof mockWalletUpsert;
  };
  mantouWithdrawRequest?: {
    create: typeof mockWithdrawCreate;
  };
};

type TxHandler<T = unknown> = (tx: MantouTxProxy) => T | Promise<T>;

beforeEach(() => {
  vi.clearAllMocks();
});

const now = new Date("2026-01-15T10:00:00Z");

const baseWalletRow = {
  address: "0xuser1",
  balance: 500,
  frozen: 100,
  createdAt: now,
  updatedAt: null,
};

const baseTxRow = {
  id: "MT-1",
  address: "0xuser1",
  type: "credit",
  amount: 100,
  orderId: null,
  note: null,
  createdAt: now,
};

const baseWithdrawRow = {
  id: "MW-1",
  address: "0xuser1",
  amount: 200,
  status: "待审核",
  note: null,
  account: null,
  createdAt: now,
  updatedAt: null,
};

// ---- getMantouWallet ----

describe("getMantouWallet", () => {
  it("returns wallet when found", async () => {
    mockWalletFindUnique.mockResolvedValue(baseWalletRow);

    const result = await getMantouWallet("0xuser1");
    expect(result.address).toBe("0xuser1");
    expect(result.balance).toBe(500);
    expect(result.frozen).toBe(100);
    expect(result.createdAt).toBe(now.getTime());
  });

  it("returns default wallet when not found", async () => {
    mockWalletFindUnique.mockResolvedValue(null);

    const result = await getMantouWallet("0xnew");
    expect(result.address).toBe("0xnew");
    expect(result.balance).toBe(0);
    expect(result.frozen).toBe(0);
  });

  it("maps updatedAt when present", async () => {
    mockWalletFindUnique.mockResolvedValue({ ...baseWalletRow, updatedAt: now });

    const result = await getMantouWallet("0xuser1");
    expect(result.updatedAt).toBe(now.getTime());
  });

  it("maps updatedAt as undefined when null", async () => {
    mockWalletFindUnique.mockResolvedValue(baseWalletRow);

    const result = await getMantouWallet("0xuser1");
    expect(result.updatedAt).toBeUndefined();
  });
});

// ---- creditMantou ----

describe("creditMantou", () => {
  it("credits mantou and returns wallet + transaction", async () => {
    mockTransaction.mockImplementation(async (fn: TxHandler) => {
      const tx = {
        mantouTransaction: { findFirst: mockTxFindFirst },
        mantouWallet: { findUnique: mockWalletFindUnique, upsert: mockWalletUpsert },
        mantouTransaction2: { create: mockTxCreate },
      };
      // The function uses tx.mantouWallet.upsert and tx.mantouTransaction.create
      // We need to provide a proper tx mock
      const txProxy = {
        mantouTransaction: {
          findFirst: mockTxFindFirst,
          create: mockTxCreate,
        },
        mantouWallet: {
          findUnique: mockWalletFindUnique,
          upsert: mockWalletUpsert,
        },
      };
      return fn(txProxy);
    });
    mockTxFindFirst.mockResolvedValue(null);
    mockWalletUpsert.mockResolvedValue({ ...baseWalletRow, balance: 600 });
    mockTxCreate.mockResolvedValue({ ...baseTxRow, amount: 100 });

    const result = await creditMantou({ address: "0xuser1", amount: 100 });
    expect(result.duplicated).toBe(false);
    expect(result.wallet!.balance).toBe(600);
    expect(result.transaction.amount).toBe(100);
  });

  it("returns duplicated when orderId already credited", async () => {
    mockTransaction.mockImplementation(async (fn: TxHandler) => {
      const txProxy = {
        mantouTransaction: {
          findFirst: mockTxFindFirst,
          create: mockTxCreate,
        },
        mantouWallet: {
          findUnique: mockWalletFindUnique,
          upsert: mockWalletUpsert,
        },
      };
      return fn(txProxy);
    });
    mockTxFindFirst.mockResolvedValue(baseTxRow);
    mockWalletFindUnique.mockResolvedValue(baseWalletRow);

    const result = await creditMantou({ address: "0xuser1", amount: 100, orderId: "ORD-1" });
    expect(result.duplicated).toBe(true);
  });

  it("throws on zero amount", async () => {
    await expect(creditMantou({ address: "0xuser1", amount: 0 })).rejects.toThrow(
      "amount must be positive integer"
    );
  });

  it("throws on negative amount", async () => {
    await expect(creditMantou({ address: "0xuser1", amount: -10 })).rejects.toThrow(
      "amount must be positive integer"
    );
  });

  it("throws on NaN amount", async () => {
    await expect(creditMantou({ address: "0xuser1", amount: NaN })).rejects.toThrow(
      "amount must be positive integer"
    );
  });

  it("floors fractional amounts", async () => {
    mockTransaction.mockImplementation(async (fn: TxHandler) => {
      const txProxy = {
        mantouTransaction: { findFirst: mockTxFindFirst, create: mockTxCreate },
        mantouWallet: { findUnique: mockWalletFindUnique, upsert: mockWalletUpsert },
      };
      return fn(txProxy);
    });
    mockTxFindFirst.mockResolvedValue(null);
    mockWalletUpsert.mockResolvedValue({ ...baseWalletRow, balance: 503 });
    mockTxCreate.mockResolvedValue({ ...baseTxRow, amount: 3 });

    const result = await creditMantou({ address: "0xuser1", amount: 3.9 });
    expect(result.transaction.amount).toBe(3);
  });
});

// ---- requestMantouWithdraw ----

describe("requestMantouWithdraw", () => {
  it("creates withdraw request and freezes balance", async () => {
    mockTransaction.mockImplementation(async (fn: TxHandler) => {
      const txProxy = {
        mantouWallet: { findUnique: mockWalletFindUnique, upsert: mockWalletUpsert },
        mantouWithdrawRequest: { create: mockWithdrawCreate },
        mantouTransaction: { create: mockTxCreate },
      };
      return fn(txProxy);
    });
    mockWalletFindUnique.mockResolvedValue(baseWalletRow);
    mockWalletUpsert.mockResolvedValue({ ...baseWalletRow, balance: 300, frozen: 300 });
    mockWithdrawCreate.mockResolvedValue(baseWithdrawRow);
    mockTxCreate.mockResolvedValue(baseTxRow);

    const result = await requestMantouWithdraw({ address: "0xuser1", amount: 200 });
    expect(result.wallet.balance).toBe(300);
    expect(result.wallet.frozen).toBe(300);
    expect(result.request.amount).toBe(200);
  });

  it("throws when balance insufficient", async () => {
    mockTransaction.mockImplementation(async (fn: TxHandler) => {
      const txProxy = {
        mantouWallet: { findUnique: mockWalletFindUnique, upsert: mockWalletUpsert },
        mantouWithdrawRequest: { create: mockWithdrawCreate },
        mantouTransaction: { create: mockTxCreate },
      };
      return fn(txProxy);
    });
    mockWalletFindUnique.mockResolvedValue({ ...baseWalletRow, balance: 50 });

    await expect(requestMantouWithdraw({ address: "0xuser1", amount: 200 })).rejects.toThrow(
      "余额不足"
    );
  });

  it("throws on zero amount", async () => {
    await expect(requestMantouWithdraw({ address: "0xuser1", amount: 0 })).rejects.toThrow(
      "amount must be positive integer"
    );
  });
});

// ---- queryMantouWithdraws ----

describe("queryMantouWithdraws", () => {
  it("returns paginated withdraw requests", async () => {
    mockWithdrawCount.mockResolvedValue(15);
    mockWithdrawFindMany.mockResolvedValue([baseWithdrawRow]);

    const result = await queryMantouWithdraws({ page: 1, pageSize: 10 });
    expect(result.total).toBe(15);
    expect(result.totalPages).toBe(2);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].status).toBe("待审核");
  });

  it("filters by status", async () => {
    mockWithdrawCount.mockResolvedValue(3);
    mockWithdrawFindMany.mockResolvedValue([]);

    const result = await queryMantouWithdraws({ page: 1, pageSize: 10, status: "已通过" });
    expect(result.total).toBe(3);
  });

  it("filters by address", async () => {
    mockWithdrawCount.mockResolvedValue(2);
    mockWithdrawFindMany.mockResolvedValue([baseWithdrawRow]);

    const result = await queryMantouWithdraws({
      page: 1,
      pageSize: 10,
      address: "0xuser1",
    });
    expect(result.items).toHaveLength(1);
  });

  it("clamps page to valid range", async () => {
    mockWithdrawCount.mockResolvedValue(5);
    mockWithdrawFindMany.mockResolvedValue([]);

    const result = await queryMantouWithdraws({ page: 999, pageSize: 10 });
    expect(result.page).toBe(1);
  });
});

// ---- queryMantouWithdrawsCursor ----

describe("queryMantouWithdrawsCursor", () => {
  it("returns items with no nextCursor when not enough", async () => {
    mockWithdrawFindMany.mockResolvedValue([baseWithdrawRow]);

    const result = await queryMantouWithdrawsCursor({ pageSize: 10 });
    expect(result.items).toHaveLength(1);
    expect(result.nextCursor).toBeNull();
  });

  it("returns nextCursor when hasMore", async () => {
    const rows = Array.from({ length: 11 }, (_, i) => ({
      ...baseWithdrawRow,
      id: `MW-${i}`,
    }));
    mockWithdrawFindMany.mockResolvedValue(rows);

    const result = await queryMantouWithdrawsCursor({ pageSize: 10 });
    expect(result.items).toHaveLength(10);
    expect(result.nextCursor).not.toBeNull();
  });

  it("filters by status", async () => {
    mockWithdrawFindMany.mockResolvedValue([baseWithdrawRow]);

    await queryMantouWithdrawsCursor({ pageSize: 10, status: "已通过" });
    expect(mockWithdrawFindMany).toHaveBeenCalled();
  });

  it("ignores 全部 status filter", async () => {
    mockWithdrawFindMany.mockResolvedValue([baseWithdrawRow]);

    await queryMantouWithdrawsCursor({ pageSize: 10, status: "全部" });
    expect(mockWithdrawFindMany).toHaveBeenCalled();
  });

  it("filters by address", async () => {
    mockWithdrawFindMany.mockResolvedValue([baseWithdrawRow]);

    await queryMantouWithdrawsCursor({ pageSize: 10, address: "0xuser1" });
    expect(mockWithdrawFindMany).toHaveBeenCalled();
  });
});

// ---- updateMantouWithdrawStatus ----

describe("updateMantouWithdrawStatus", () => {
  it("returns null when request not found", async () => {
    mockTransaction.mockImplementation(async (fn: TxHandler) => {
      const txProxy = {
        mantouWithdrawRequest: {
          findUnique: mockWithdrawFindUnique,
          update: mockWithdrawUpdate,
        },
        mantouWallet: { findUnique: mockWalletFindUnique, upsert: mockWalletUpsert },
        mantouTransaction: { create: mockTxCreate },
      };
      return fn(txProxy);
    });
    mockWithdrawFindUnique.mockResolvedValue(null);

    const result = await updateMantouWithdrawStatus({ id: "MW-999", status: "已通过" });
    expect(result).toBeNull();
  });

  it("returns existing when status unchanged", async () => {
    mockTransaction.mockImplementation(async (fn: TxHandler) => {
      const txProxy = {
        mantouWithdrawRequest: {
          findUnique: mockWithdrawFindUnique,
          update: mockWithdrawUpdate,
        },
        mantouWallet: { findUnique: mockWalletFindUnique, upsert: mockWalletUpsert },
        mantouTransaction: { create: mockTxCreate },
      };
      return fn(txProxy);
    });
    mockWithdrawFindUnique.mockResolvedValue({ ...baseWithdrawRow, status: "已通过" });

    const result = await updateMantouWithdrawStatus({ id: "MW-1", status: "已通过" });
    expect(result).not.toBeNull();
    expect(result!.status).toBe("已通过");
  });

  it("processes 已打款 status - decrements frozen", async () => {
    mockTransaction.mockImplementation(async (fn: TxHandler) => {
      const txProxy = {
        mantouWithdrawRequest: {
          findUnique: mockWithdrawFindUnique,
          update: mockWithdrawUpdate,
        },
        mantouWallet: { findUnique: mockWalletFindUnique, upsert: mockWalletUpsert },
        mantouTransaction: { create: mockTxCreate },
      };
      return fn(txProxy);
    });
    mockWithdrawFindUnique.mockResolvedValue(baseWithdrawRow);
    mockWalletFindUnique.mockResolvedValue({ ...baseWalletRow, frozen: 200 });
    mockWalletUpsert.mockResolvedValue({ ...baseWalletRow, frozen: 0 });
    mockTxCreate.mockResolvedValue(baseTxRow);
    mockWithdrawUpdate.mockResolvedValue({ ...baseWithdrawRow, status: "已打款" });

    const result = await updateMantouWithdrawStatus({ id: "MW-1", status: "已打款" });
    expect(result!.status).toBe("已打款");
    expect(mockWalletUpsert).toHaveBeenCalled();
    expect(mockTxCreate).toHaveBeenCalled();
  });

  it("processes 已拒绝 status - returns frozen to balance", async () => {
    mockTransaction.mockImplementation(async (fn: TxHandler) => {
      const txProxy = {
        mantouWithdrawRequest: {
          findUnique: mockWithdrawFindUnique,
          update: mockWithdrawUpdate,
        },
        mantouWallet: { findUnique: mockWalletFindUnique, upsert: mockWalletUpsert },
        mantouTransaction: { create: mockTxCreate },
      };
      return fn(txProxy);
    });
    mockWithdrawFindUnique.mockResolvedValue(baseWithdrawRow);
    mockWalletFindUnique.mockResolvedValue({ ...baseWalletRow, frozen: 200 });
    mockWalletUpsert.mockResolvedValue({ ...baseWalletRow, balance: 700, frozen: 0 });
    mockTxCreate.mockResolvedValue(baseTxRow);
    mockWithdrawUpdate.mockResolvedValue({ ...baseWithdrawRow, status: "已拒绝" });

    const result = await updateMantouWithdrawStatus({ id: "MW-1", status: "已拒绝" });
    expect(result!.status).toBe("已拒绝");
    expect(mockWalletUpsert).toHaveBeenCalled();
  });

  it("throws when frozen balance insufficient", async () => {
    mockTransaction.mockImplementation(async (fn: TxHandler) => {
      const txProxy = {
        mantouWithdrawRequest: {
          findUnique: mockWithdrawFindUnique,
          update: mockWithdrawUpdate,
        },
        mantouWallet: { findUnique: mockWalletFindUnique, upsert: mockWalletUpsert },
        mantouTransaction: { create: mockTxCreate },
      };
      return fn(txProxy);
    });
    mockWithdrawFindUnique.mockResolvedValue(baseWithdrawRow);
    mockWalletFindUnique.mockResolvedValue({ ...baseWalletRow, frozen: 10 });

    await expect(updateMantouWithdrawStatus({ id: "MW-1", status: "已打款" })).rejects.toThrow(
      "冻结余额不足"
    );
  });

  it("processes 已退回 status - returns frozen to balance", async () => {
    mockTransaction.mockImplementation(async (fn: TxHandler) => {
      const txProxy = {
        mantouWithdrawRequest: {
          findUnique: mockWithdrawFindUnique,
          update: mockWithdrawUpdate,
        },
        mantouWallet: { findUnique: mockWalletFindUnique, upsert: mockWalletUpsert },
        mantouTransaction: { create: mockTxCreate },
      };
      return fn(txProxy);
    });
    mockWithdrawFindUnique.mockResolvedValue(baseWithdrawRow);
    mockWalletFindUnique.mockResolvedValue({ ...baseWalletRow, frozen: 200 });
    mockWalletUpsert.mockResolvedValue({ ...baseWalletRow, balance: 700, frozen: 0 });
    mockTxCreate.mockResolvedValue(baseTxRow);
    mockWithdrawUpdate.mockResolvedValue({ ...baseWithdrawRow, status: "已退回" });

    const result = await updateMantouWithdrawStatus({ id: "MW-1", status: "已退回" });
    expect(result!.status).toBe("已退回");
    expect(mockWalletUpsert).toHaveBeenCalled();
    expect(mockTxCreate).toHaveBeenCalled();
  });

  it("processes 已通过 status - creates transaction", async () => {
    mockTransaction.mockImplementation(async (fn: TxHandler) => {
      const txProxy = {
        mantouWithdrawRequest: {
          findUnique: mockWithdrawFindUnique,
          update: mockWithdrawUpdate,
        },
        mantouWallet: { findUnique: mockWalletFindUnique, upsert: mockWalletUpsert },
        mantouTransaction: { create: mockTxCreate },
      };
      return fn(txProxy);
    });
    mockWithdrawFindUnique.mockResolvedValue(baseWithdrawRow);
    mockWalletFindUnique.mockResolvedValue({ ...baseWalletRow, frozen: 200 });
    mockTxCreate.mockResolvedValue(baseTxRow);
    mockWithdrawUpdate.mockResolvedValue({ ...baseWithdrawRow, status: "已通过" });

    const result = await updateMantouWithdrawStatus({ id: "MW-1", status: "已通过" });
    expect(result!.status).toBe("已通过");
    expect(mockTxCreate).toHaveBeenCalled();
  });

  it("handles wallet not found (null frozen)", async () => {
    mockTransaction.mockImplementation(async (fn: TxHandler) => {
      const txProxy = {
        mantouWithdrawRequest: {
          findUnique: mockWithdrawFindUnique,
          update: mockWithdrawUpdate,
        },
        mantouWallet: { findUnique: mockWalletFindUnique, upsert: mockWalletUpsert },
        mantouTransaction: { create: mockTxCreate },
      };
      return fn(txProxy);
    });
    mockWithdrawFindUnique.mockResolvedValue(baseWithdrawRow);
    mockWalletFindUnique.mockResolvedValue(null);

    await expect(updateMantouWithdrawStatus({ id: "MW-1", status: "已打款" })).rejects.toThrow(
      "冻结余额不足"
    );
  });
});

// ---- queryMantouTransactions ----

describe("queryMantouTransactions", () => {
  it("returns paginated transactions", async () => {
    mockTxCount.mockResolvedValue(30);
    mockTxFindMany.mockResolvedValue([baseTxRow]);

    const result = await queryMantouTransactions({ page: 1, pageSize: 10, address: "0xuser1" });
    expect(result.total).toBe(30);
    expect(result.totalPages).toBe(3);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].type).toBe("credit");
  });

  it("clamps page to valid range", async () => {
    mockTxCount.mockResolvedValue(5);
    mockTxFindMany.mockResolvedValue([]);

    const result = await queryMantouTransactions({ page: 100, pageSize: 10, address: "0xuser1" });
    expect(result.page).toBe(1);
  });

  it("maps optional fields correctly", async () => {
    mockTxCount.mockResolvedValue(1);
    mockTxFindMany.mockResolvedValue([{ ...baseTxRow, orderId: "ORD-1", note: "some note" }]);

    const result = await queryMantouTransactions({ page: 1, pageSize: 10, address: "0xuser1" });
    expect(result.items[0].orderId).toBe("ORD-1");
    expect(result.items[0].note).toBe("some note");
  });
});
