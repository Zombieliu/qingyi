import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ──
const mockSignAndSendTxn = vi.fn();
const mockUpsertLedgerRecord = vi.fn();

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env", () => ({
  env: {
    SUI_RPC_URL: "https://rpc.test.sui.io",
    SUI_ADMIN_PRIVATE_KEY: "0x" + "ab".repeat(32),
    SUI_PACKAGE_ID: "0x" + "cc".repeat(32),
    SUI_DAPP_HUB_ID: "0x" + "dd".repeat(32),
    SUI_DAPP_HUB_INITIAL_SHARED_VERSION: "1",
    SUI_NETWORK: "testnet",
  },
}));

vi.mock("@0xobelisk/sui-client", () => {
  class Dubhe {
    tx = {
      ledger_system: {
        credit_balance_with_receipt: vi.fn(),
      },
    };
    signAndSendTxn = mockSignAndSendTxn;
  }
  class Transaction {
    moveCall = vi.fn();
    object = vi.fn((v: unknown) => v);
    pure = {
      u64: vi.fn((v: unknown) => v),
      address: vi.fn((v: unknown) => v),
      vector: vi.fn((_type: string, v: unknown) => v),
    };
  }
  return { Dubhe, Transaction };
});

vi.mock("@mysten/sui/transactions", () => ({
  Inputs: { SharedObjectRef: vi.fn((v: unknown) => v) },
}));

vi.mock("contracts/metadata.json", () => ({ default: {} }));

vi.mock("@/lib/admin/admin-store", () => ({
  upsertLedgerRecord: (...args: unknown[]) => mockUpsertLedgerRecord(...args),
}));

import { creditLedgerWithAdmin } from "../ledger-credit";

beforeEach(() => {
  vi.clearAllMocks();
});

const baseParams = {
  userAddress: "0x" + "aa".repeat(32),
  amount: "100",
  receiptId: "REC-001",
};

const successResult = {
  digest: "mock-digest-abc",
  effects: { status: { status: "success" } },
  events: [],
};

describe("creditLedgerWithAdmin", () => {
  it("succeeds with valid params and returns digest", async () => {
    mockSignAndSendTxn.mockResolvedValue(successResult);
    mockUpsertLedgerRecord.mockResolvedValue({});

    const result = await creditLedgerWithAdmin(baseParams);

    expect(result.digest).toBe("mock-digest-abc");
    expect(result.recordId).toBe("REC-001");
    expect(mockSignAndSendTxn).toHaveBeenCalledTimes(1);
  });

  it("uses orderId as recordId when provided", async () => {
    mockSignAndSendTxn.mockResolvedValue(successResult);
    mockUpsertLedgerRecord.mockResolvedValue({});

    const result = await creditLedgerWithAdmin({
      ...baseParams,
      orderId: "ORD-123",
    });

    expect(result.recordId).toBe("ORD-123");
  });

  it("trims orderId whitespace", async () => {
    mockSignAndSendTxn.mockResolvedValue(successResult);
    mockUpsertLedgerRecord.mockResolvedValue({});

    const result = await creditLedgerWithAdmin({
      ...baseParams,
      orderId: "  ORD-456  ",
    });

    expect(result.recordId).toBe("ORD-456");
  });

  it("falls back to receiptId when orderId is empty", async () => {
    mockSignAndSendTxn.mockResolvedValue(successResult);
    mockUpsertLedgerRecord.mockResolvedValue({});

    const result = await creditLedgerWithAdmin({
      ...baseParams,
      orderId: "   ",
    });

    expect(result.recordId).toBe("REC-001");
  });

  it("rejects zero amount", async () => {
    await expect(creditLedgerWithAdmin({ ...baseParams, amount: "0" })).rejects.toThrow(
      "amount must be positive integer"
    );
  });

  it("rejects negative amount", async () => {
    await expect(creditLedgerWithAdmin({ ...baseParams, amount: "-5" })).rejects.toThrow(
      "amount must be positive integer"
    );
  });

  it("rejects non-numeric amount", async () => {
    await expect(creditLedgerWithAdmin({ ...baseParams, amount: "abc" })).rejects.toThrow(
      "amount must be positive integer"
    );
  });

  it("rejects decimal amount", async () => {
    await expect(creditLedgerWithAdmin({ ...baseParams, amount: "10.5" })).rejects.toThrow(
      "amount must be positive integer"
    );
  });

  it("accepts numeric amount and converts to string", async () => {
    mockSignAndSendTxn.mockResolvedValue(successResult);
    mockUpsertLedgerRecord.mockResolvedValue({});

    const result = await creditLedgerWithAdmin({
      ...baseParams,
      amount: 200,
    });

    expect(result.digest).toBe("mock-digest-abc");
  });

  it("retries on retryable errors", async () => {
    mockSignAndSendTxn
      .mockRejectedValueOnce(new Error("object already locked"))
      .mockResolvedValueOnce(successResult);
    mockUpsertLedgerRecord.mockResolvedValue({});

    const result = await creditLedgerWithAdmin(baseParams);

    expect(result.digest).toBe("mock-digest-abc");
    expect(mockSignAndSendTxn).toHaveBeenCalledTimes(2);
  });

  it("throws after max retries on retryable errors", async () => {
    const retryableError = new Error("object already locked");
    mockSignAndSendTxn.mockRejectedValue(retryableError);

    await expect(creditLedgerWithAdmin(baseParams)).rejects.toThrow("object already locked");
    expect(mockSignAndSendTxn).toHaveBeenCalledTimes(3);
  });

  it("does not retry on non-retryable errors", async () => {
    mockSignAndSendTxn.mockRejectedValue(new Error("insufficient gas"));

    await expect(creditLedgerWithAdmin(baseParams)).rejects.toThrow("insufficient gas");
    expect(mockSignAndSendTxn).toHaveBeenCalledTimes(1);
  });

  it("calls upsertLedgerRecord with correct params", async () => {
    mockSignAndSendTxn.mockResolvedValue(successResult);
    mockUpsertLedgerRecord.mockResolvedValue({});

    await creditLedgerWithAdmin({
      ...baseParams,
      orderId: "ORD-789",
      note: "test credit",
      amountCny: 9.99,
      currency: "CNY",
      source: "manual",
    });

    expect(mockUpsertLedgerRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ORD-789",
        userAddress: baseParams.userAddress,
        diamondAmount: 100,
        amount: 9.99,
        currency: "CNY",
        channel: "manual",
        status: "credited",
        orderId: "ORD-789",
        receiptId: "REC-001",
        source: "manual",
        note: "test credit",
      })
    );
  });

  it("sets channel to undefined for stripe source", async () => {
    mockSignAndSendTxn.mockResolvedValue(successResult);
    mockUpsertLedgerRecord.mockResolvedValue({});

    await creditLedgerWithAdmin({
      ...baseParams,
      source: "stripe",
    });

    expect(mockUpsertLedgerRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: undefined,
        source: "stripe",
      })
    );
  });

  it("succeeds even if upsertLedgerRecord fails", async () => {
    mockSignAndSendTxn.mockResolvedValue(successResult);
    mockUpsertLedgerRecord.mockRejectedValue(new Error("db error"));

    const result = await creditLedgerWithAdmin(baseParams);

    expect(result.digest).toBe("mock-digest-abc");
  });

  it("throws when required env vars are missing", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/env", () => ({
      env: {
        SUI_RPC_URL: "",
        SUI_ADMIN_PRIVATE_KEY: "",
        SUI_PACKAGE_ID: "",
        SUI_DAPP_HUB_ID: "",
        SUI_DAPP_HUB_INITIAL_SHARED_VERSION: "",
        SUI_NETWORK: "testnet",
      },
    }));
    vi.doMock("@0xobelisk/sui-client", () => {
      class Dubhe {
        tx = { ledger_system: { credit_balance_with_receipt: vi.fn() } };
        signAndSendTxn = vi.fn();
      }
      class Transaction {
        moveCall = vi.fn();
        object = vi.fn((v: unknown) => v);
        pure = {
          u64: vi.fn((v: unknown) => v),
          address: vi.fn((v: unknown) => v),
          vector: vi.fn((_t: string, v: unknown) => v),
        };
      }
      return { Dubhe, Transaction };
    });
    vi.doMock("@mysten/sui/transactions", () => ({
      Inputs: { SharedObjectRef: vi.fn((v: unknown) => v) },
    }));
    vi.doMock("contracts/metadata.json", () => ({ default: {} }));
    vi.doMock("@/lib/admin/admin-store", () => ({
      upsertLedgerRecord: vi.fn(),
    }));
    const mod = await import("../ledger-credit");
    await expect(
      mod.creditLedgerWithAdmin({
        userAddress: "0x" + "aa".repeat(32),
        amount: "100",
        receiptId: "REC-1",
      })
    ).rejects.toThrow("Missing env");
  });

  it("uses moveCall fallback when metadata is empty", async () => {
    // The default mock has empty metadata, so it should use the moveCall fallback
    mockSignAndSendTxn.mockResolvedValue(successResult);
    mockUpsertLedgerRecord.mockResolvedValue({});

    const result = await creditLedgerWithAdmin(baseParams);
    expect(result.digest).toBe("mock-digest-abc");
  });

  it("uses metadata entry when available", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/env", () => ({
      env: {
        SUI_RPC_URL: "https://rpc.test.sui.io",
        SUI_ADMIN_PRIVATE_KEY: "0x" + "ab".repeat(32),
        SUI_PACKAGE_ID: "0x" + "cc".repeat(32),
        SUI_DAPP_HUB_ID: "0x" + "dd".repeat(32),
        SUI_DAPP_HUB_INITIAL_SHARED_VERSION: "1",
        SUI_NETWORK: "testnet",
      },
    }));
    const mockEntry = vi.fn();
    const mockSend = vi.fn().mockResolvedValue(successResult);
    vi.doMock("@0xobelisk/sui-client", () => {
      class Dubhe {
        tx = {
          ledger_system: {
            credit_balance_with_receipt: mockEntry,
          },
        };
        signAndSendTxn = mockSend;
      }
      class Transaction {
        moveCall = vi.fn();
        object = vi.fn((v: unknown) => v);
        pure = {
          u64: vi.fn((v: unknown) => v),
          address: vi.fn((v: unknown) => v),
          vector: vi.fn((_type: string, v: unknown) => v),
        };
      }
      return { Dubhe, Transaction };
    });
    vi.doMock("@mysten/sui/transactions", () => ({
      Inputs: { SharedObjectRef: vi.fn((v: unknown) => v) },
    }));
    vi.doMock("contracts/metadata.json", () => ({
      default: { some_module: { functions: {} } },
    }));
    vi.doMock("@/lib/admin/admin-store", () => ({
      upsertLedgerRecord: vi.fn().mockResolvedValue({}),
    }));

    const mod = await import("../ledger-credit");
    const result = await mod.creditLedgerWithAdmin(baseParams);
    expect(result.digest).toBe("mock-digest-abc");
    expect(mockEntry).toHaveBeenCalled();
  });

  it("handles retryable error 'wrong epoch'", async () => {
    mockSignAndSendTxn
      .mockRejectedValueOnce(new Error("wrong epoch"))
      .mockResolvedValueOnce(successResult);
    mockUpsertLedgerRecord.mockResolvedValue({});

    const result = await creditLedgerWithAdmin(baseParams);
    expect(result.digest).toBe("mock-digest-abc");
    expect(mockSignAndSendTxn).toHaveBeenCalledTimes(2);
  });

  it("handles retryable error 'temporarily unavailable'", async () => {
    mockSignAndSendTxn
      .mockRejectedValueOnce(new Error("temporarily unavailable"))
      .mockResolvedValueOnce(successResult);
    mockUpsertLedgerRecord.mockResolvedValue({});

    const result = await creditLedgerWithAdmin(baseParams);
    expect(result.digest).toBe("mock-digest-abc");
  });

  it("throws 'credit failed' when result is null and no lastError", async () => {
    // Simulate a scenario where signAndSendTxn resolves to null/undefined
    // (result is falsy after the loop)
    mockSignAndSendTxn.mockResolvedValue(null);
    mockUpsertLedgerRecord.mockResolvedValue({});

    await expect(creditLedgerWithAdmin(baseParams)).rejects.toThrow("credit failed");
  });
});
