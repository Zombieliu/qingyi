import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock env
vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_QY_DEFAULT_COMPANION: "" },
}));

// Mock admin-store
const mockGetOrderById = vi.fn();
const mockAddOrder = vi.fn();
const mockUpdateOrder = vi.fn();
const mockProcessReferralReward = vi.fn();
vi.mock("../../admin/admin-store", () => ({
  getOrderById: (...a: unknown[]) => mockGetOrderById(...a),
  addOrder: (...a: unknown[]) => mockAddOrder(...a),
  updateOrder: (...a: unknown[]) => mockUpdateOrder(...a),
  processReferralReward: (...a: unknown[]) => mockProcessReferralReward(...a),
}));

// Mock chain-admin
const mockFetchChainOrdersAdmin = vi.fn();
const mockFetchChainOrdersAdminWithCursor = vi.fn();
vi.mock("../chain-admin", () => ({
  fetchChainOrdersAdmin: (...a: unknown[]) => mockFetchChainOrdersAdmin(...a),
  fetchChainOrdersAdminWithCursor: (...a: unknown[]) => mockFetchChainOrdersAdminWithCursor(...a),
}));

// Mock chain-order-cache
vi.mock("../chain-order-cache", () => ({
  findChainOrderCached: vi.fn(),
  clearCache: vi.fn(),
  getCacheStats: vi.fn(() => ({ hits: 0, misses: 0 })),
  fetchChainOrdersCached: vi.fn(),
}));

// Mock chain-event-cursor
const mockGetChainEventCursor = vi.fn();
const mockUpdateChainEventCursor = vi.fn();
vi.mock("../chain-event-cursor", () => ({
  getChainEventCursor: (...a: unknown[]) => mockGetChainEventCursor(...a),
  updateChainEventCursor: (...a: unknown[]) => mockUpdateChainEventCursor(...a),
}));

// Mock @mysten/sui/utils
vi.mock("@mysten/sui/utils", () => ({
  normalizeSuiAddress: (addr: string) => {
    if (!addr) return "0x" + "0".repeat(64);
    if (addr.startsWith("0x") && addr.length === 66) return addr.toLowerCase();
    return "0x" + addr.replace(/^0x/, "").padStart(64, "0").toLowerCase();
  },
  isValidSuiAddress: (addr: string) =>
    typeof addr === "string" && addr.startsWith("0x") && addr.length === 66,
}));

import { upsertChainOrder, syncChainOrders } from "../chain-sync";
import type { ChainOrder } from "../chain-admin";

const USER_ADDR = "0x" + "a".repeat(64);
const COMPANION_ADDR = "0x" + "b".repeat(64);
const ZERO_ADDR = "0x" + "0".repeat(64);

function makeChainOrder(overrides: Partial<ChainOrder> = {}): ChainOrder {
  return {
    orderId: "order-1",
    user: USER_ADDR,
    companion: COMPANION_ADDR,
    ruleSetId: "rs1",
    serviceFee: "10000",
    deposit: "5000",
    platformFeeBps: "100",
    status: 1,
    createdAt: String(Date.now()),
    finishAt: "0",
    disputeDeadline: "0",
    vaultService: "0",
    vaultDeposit: "0",
    evidenceHash: "",
    disputeStatus: 0,
    resolvedBy: "",
    resolvedAt: "0",
    lastUpdatedMs: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── toCny (tested via upsertChainOrder) ───

describe("upsertChainOrder", () => {
  describe("new order creation", () => {
    it("creates a new order when none exists", async () => {
      mockGetOrderById.mockResolvedValue(null);
      mockAddOrder.mockImplementation((o: unknown) => o);
      const chain = makeChainOrder();
      await upsertChainOrder(chain);
      expect(mockAddOrder).toHaveBeenCalledTimes(1);
      const arg = mockAddOrder.mock.calls[0][0];
      expect(arg.id).toBe("order-1");
      expect(arg.source).toBe("chain");
      expect(arg.serviceFee).toBe(100); // 10000/100
      expect(arg.deposit).toBe(50); // 5000/100
      expect(arg.amount).toBe(150); // serviceFee + deposit
      expect(arg.currency).toBe("CNY");
    });

    it("marks publicPool=true when companion is zero address", async () => {
      mockGetOrderById.mockResolvedValue(null);
      mockAddOrder.mockImplementation((o: unknown) => o);
      const chain = makeChainOrder({ companion: ZERO_ADDR });
      await upsertChainOrder(chain);
      const arg = mockAddOrder.mock.calls[0][0];
      expect(arg.meta.publicPool).toBe(true);
    });

    it("marks publicPool=false when companion is valid", async () => {
      mockGetOrderById.mockResolvedValue(null);
      mockAddOrder.mockImplementation((o: unknown) => o);
      const chain = makeChainOrder({ companion: COMPANION_ADDR });
      await upsertChainOrder(chain);
      const arg = mockAddOrder.mock.calls[0][0];
      expect(arg.meta.publicPool).toBe(false);
    });
  });

  describe("existing order update", () => {
    it("updates existing order", async () => {
      const existing = {
        id: "order-1",
        amount: 200,
        stage: "进行中",
        chainStatus: 2,
        meta: {},
      };
      mockGetOrderById.mockResolvedValue(existing);
      mockUpdateOrder.mockImplementation((_id: string, patch: Record<string, unknown>) => ({
        ...existing,
        ...patch,
      }));
      const chain = makeChainOrder({ status: 3 });
      await upsertChainOrder(chain);
      expect(mockUpdateOrder).toHaveBeenCalledTimes(1);
      expect(mockAddOrder).not.toHaveBeenCalled();
    });

    it("preserves existing amount", async () => {
      const existing = {
        id: "order-1",
        amount: 999,
        stage: "待处理",
        meta: {},
      };
      mockGetOrderById.mockResolvedValue(existing);
      mockUpdateOrder.mockImplementation((_id: string, patch: Record<string, unknown>) => ({
        ...existing,
        ...patch,
      }));
      const chain = makeChainOrder({ serviceFee: "20000", deposit: "10000" });
      await upsertChainOrder(chain);
      // amount should NOT be overwritten — existing.amount is preserved
      // (amount is only set in the addOrder path)
      const patchArg = mockUpdateOrder.mock.calls[0][1];
      expect(patchArg.amount).toBeUndefined();
    });

    it("preserves amounts when paymentMode is diamond_escrow", async () => {
      const existing = {
        id: "order-1",
        amount: 500,
        stage: "待处理",
        serviceFee: 100,
        deposit: 50,
        meta: { paymentMode: "diamond_escrow" },
      };
      mockGetOrderById.mockResolvedValue(existing);
      mockUpdateOrder.mockImplementation((_id: string, patch: Record<string, unknown>) => ({
        ...existing,
        ...patch,
      }));
      const chain = makeChainOrder({ serviceFee: "99999", deposit: "88888" });
      await upsertChainOrder(chain);
      const patchArg = mockUpdateOrder.mock.calls[0][1];
      expect(patchArg.serviceFee).toBeUndefined();
      expect(patchArg.deposit).toBeUndefined();
    });

    it("triggers referral reward on completion", async () => {
      const existing = {
        id: "order-1",
        amount: 150,
        stage: "进行中",
        chainStatus: 3,
        meta: {},
      };
      mockGetOrderById.mockResolvedValue(existing);
      mockUpdateOrder.mockImplementation((_id: string, patch: Record<string, unknown>) => ({
        ...existing,
        ...patch,
        stage: patch.stage,
      }));
      mockProcessReferralReward.mockResolvedValue(undefined);
      const chain = makeChainOrder({ status: 5 });
      await upsertChainOrder(chain);
      expect(mockProcessReferralReward).toHaveBeenCalledWith("order-1", USER_ADDR, 150);
    });

    it("preserves companion when chain companion is null but local exists", async () => {
      const existing = {
        id: "order-1",
        amount: 150,
        stage: "待处理",
        companionAddress: COMPANION_ADDR,
        meta: {},
      };
      mockGetOrderById.mockResolvedValue(existing);
      mockUpdateOrder.mockImplementation((_id: string, patch: Record<string, unknown>) => ({
        ...existing,
        ...patch,
      }));
      const chain = makeChainOrder({ companion: ZERO_ADDR });
      await upsertChainOrder(chain);
      const patchArg = mockUpdateOrder.mock.calls[0][1];
      expect(patchArg.companionAddress).toBeUndefined();
    });
  });

  describe("toCny conversion", () => {
    it("converts string cents to CNY", async () => {
      mockGetOrderById.mockResolvedValue(null);
      mockAddOrder.mockImplementation((o: unknown) => o);
      await upsertChainOrder(makeChainOrder({ serviceFee: "12345", deposit: "6789" }));
      const arg = mockAddOrder.mock.calls[0][0];
      expect(arg.serviceFee).toBe(123.45);
      expect(arg.deposit).toBe(67.89);
    });

    it("handles non-finite values as 0", async () => {
      mockGetOrderById.mockResolvedValue(null);
      mockAddOrder.mockImplementation((o: unknown) => o);
      await upsertChainOrder(makeChainOrder({ serviceFee: "NaN", deposit: "Infinity" }));
      const arg = mockAddOrder.mock.calls[0][0];
      expect(arg.serviceFee).toBe(0);
      expect(arg.deposit).toBe(0);
    });
  });
});

// ─── syncChainOrders ───

describe("syncChainOrders", () => {
  it("runs in bootstrap mode when no cursor exists", async () => {
    mockGetChainEventCursor.mockResolvedValue(null);
    mockFetchChainOrdersAdminWithCursor.mockResolvedValue({
      orders: [makeChainOrder({ orderId: "o1" })],
      latestCursor: { txDigest: "d1", eventSeq: "0" },
      latestEventMs: 1000,
    });
    mockGetOrderById.mockResolvedValue(null);
    mockAddOrder.mockImplementation((o: unknown) => o);
    mockUpdateChainEventCursor.mockResolvedValue(undefined);

    const result = await syncChainOrders();
    expect(result.mode).toBe("bootstrap");
    expect(result.total).toBe(1);
    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(mockFetchChainOrdersAdminWithCursor).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: null, order: "descending" })
    );
    expect(mockUpdateChainEventCursor).toHaveBeenCalled();
  });

  it("runs in incremental mode when cursor exists", async () => {
    const cursor = { txDigest: "d0", eventSeq: "0" };
    mockGetChainEventCursor.mockResolvedValue({ cursor });
    mockFetchChainOrdersAdminWithCursor.mockResolvedValue({
      orders: [makeChainOrder({ orderId: "o1" })],
      latestCursor: { txDigest: "d1", eventSeq: "1" },
      latestEventMs: 2000,
    });
    const existing = { id: "o1", amount: 100, stage: "待处理", meta: {} };
    mockGetOrderById.mockResolvedValue(existing);
    mockUpdateOrder.mockImplementation((_id: string, patch: Record<string, unknown>) => ({
      ...existing,
      ...patch,
    }));
    mockUpdateChainEventCursor.mockResolvedValue(undefined);

    const result = await syncChainOrders();
    expect(result.mode).toBe("incremental");
    expect(result.updated).toBe(1);
    expect(result.created).toBe(0);
    expect(mockFetchChainOrdersAdminWithCursor).toHaveBeenCalledWith(
      expect.objectContaining({ cursor, order: "ascending" })
    );
  });

  it("does not update cursor when unchanged", async () => {
    const cursor = { txDigest: "d0", eventSeq: "0" };
    mockGetChainEventCursor.mockResolvedValue({ cursor });
    mockFetchChainOrdersAdminWithCursor.mockResolvedValue({
      orders: [],
      latestCursor: { txDigest: "d0", eventSeq: "0" },
    });

    await syncChainOrders();
    expect(mockUpdateChainEventCursor).not.toHaveBeenCalled();
  });

  it("handles empty result", async () => {
    mockGetChainEventCursor.mockResolvedValue(null);
    mockFetchChainOrdersAdminWithCursor.mockResolvedValue({
      orders: [],
      latestCursor: null,
    });

    const result = await syncChainOrders();
    expect(result.total).toBe(0);
    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
  });
});
