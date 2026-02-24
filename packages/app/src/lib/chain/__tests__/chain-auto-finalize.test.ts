import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──
const mockFetchChainOrdersAdmin = vi.fn();
const mockMarkCompletedAdmin = vi.fn();
const mockFinalizeNoDisputeAdmin = vi.fn();
vi.mock("../chain-admin", () => ({
  fetchChainOrdersAdmin: (...a: unknown[]) => mockFetchChainOrdersAdmin(...a),
  markCompletedAdmin: (...a: unknown[]) => mockMarkCompletedAdmin(...a),
  finalizeNoDisputeAdmin: (...a: unknown[]) => mockFinalizeNoDisputeAdmin(...a),
}));

const mockListChainOrdersForAutoFinalize = vi.fn();
vi.mock("../../admin/admin-store", () => ({
  listChainOrdersForAutoFinalize: (...a: unknown[]) => mockListChainOrdersForAutoFinalize(...a),
}));

const mockSyncChainOrder = vi.fn();
vi.mock("../chain-sync", () => ({
  syncChainOrder: (...a: unknown[]) => mockSyncChainOrder(...a),
}));

vi.mock("../../order-guard", () => ({
  isChainOrder: (order: Record<string, unknown>) => Boolean(order.source === "chain"),
}));

vi.mock("@/lib/env", () => ({
  env: {
    CHAIN_ORDER_AUTO_COMPLETE_HOURS: 72,
    CHAIN_ORDER_AUTO_COMPLETE_MAX: 50,
    CHAIN_ORDER_AUTO_FINALIZE_MAX: 50,
  },
}));

import {
  getAutoCompleteConfig,
  getAutoFinalizeConfig,
  autoCompleteChainOrders,
  autoFinalizeChainOrders,
  autoFinalizeChainOrdersSummary,
} from "../chain-auto-finalize";
import type { ChainOrder } from "../chain-admin";

function makeOrder(overrides: Partial<ChainOrder> = {}): ChainOrder {
  return {
    orderId: "1",
    user: "0xuser",
    companion: "0xcomp",
    ruleSetId: "1",
    serviceFee: "1000",
    deposit: "500",
    platformFeeBps: "100",
    status: 2,
    createdAt: String(Date.now()),
    finishAt: "0",
    disputeDeadline: "0",
    vaultService: "0",
    vaultDeposit: "0",
    evidenceHash: "",
    disputeStatus: 0,
    resolvedBy: "",
    resolvedAt: "0",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Config ──

describe("getAutoCompleteConfig", () => {
  it("returns enabled config when hours > 0", () => {
    const config = getAutoCompleteConfig();
    expect(config.enabled).toBe(true);
    expect(config.hours).toBe(72);
    expect(config.max).toBe(50);
  });
});

describe("getAutoFinalizeConfig", () => {
  it("returns enabled config when max > 0", () => {
    const config = getAutoFinalizeConfig();
    expect(config.enabled).toBe(true);
    expect(config.max).toBe(50);
  });
});

// ── autoCompleteChainOrders ──

describe("autoCompleteChainOrders", () => {
  it("returns disabled result when config is disabled", async () => {
    const envMod = await import("@/lib/env");
    const original = envMod.env.CHAIN_ORDER_AUTO_COMPLETE_HOURS;
    (envMod.env as Record<string, unknown>).CHAIN_ORDER_AUTO_COMPLETE_HOURS = 0;

    const result = await autoCompleteChainOrders();
    expect(result.enabled).toBe(false);
    expect(result.completed).toBe(0);

    (envMod.env as Record<string, unknown>).CHAIN_ORDER_AUTO_COMPLETE_HOURS = original;
  });

  it("returns dry run result without completing", async () => {
    const nowMs = Date.now();
    const endedAt = nowMs - 72 * 60 * 60 * 1000 - 1000;
    const orders = [makeOrder({ orderId: "1", status: 2, finishAt: "0" })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockListChainOrdersForAutoFinalize.mockResolvedValue([
      { id: "1", source: "chain", meta: { companionEndedAt: endedAt } },
    ]);

    const result = await autoCompleteChainOrders({ dryRun: true });
    expect(result.enabled).toBe(true);
    expect(result.completed).toBe(0);
    expect(mockMarkCompletedAdmin).not.toHaveBeenCalled();
  });

  it("completes eligible orders", async () => {
    const nowMs = Date.now();
    const endedAt = nowMs - 72 * 60 * 60 * 1000 - 1000;
    const orders = [makeOrder({ orderId: "10", status: 2, finishAt: "0" })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockListChainOrdersForAutoFinalize.mockResolvedValue([
      { id: "10", source: "chain", meta: { companionEndedAt: endedAt } },
    ]);
    mockMarkCompletedAdmin.mockResolvedValue({ digest: "d1" });
    mockSyncChainOrder.mockResolvedValue(null);

    const result = await autoCompleteChainOrders();
    expect(result.completed).toBe(1);
    expect(result.completedIds).toEqual(["10"]);
  });

  it("skips orders with finishAt > 0", async () => {
    const nowMs = Date.now();
    const endedAt = nowMs - 72 * 60 * 60 * 1000 - 1000;
    const orders = [makeOrder({ orderId: "10", status: 2, finishAt: "12345" })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockListChainOrdersForAutoFinalize.mockResolvedValue([
      { id: "10", source: "chain", meta: { companionEndedAt: endedAt } },
    ]);

    const result = await autoCompleteChainOrders();
    expect(result.candidates).toBe(0);
    expect(result.completed).toBe(0);
  });

  it("skips orders not in DEPOSITED status", async () => {
    const nowMs = Date.now();
    const endedAt = nowMs - 72 * 60 * 60 * 1000 - 1000;
    const orders = [makeOrder({ orderId: "10", status: 3, finishAt: "0" })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockListChainOrdersForAutoFinalize.mockResolvedValue([
      { id: "10", source: "chain", meta: { companionEndedAt: endedAt } },
    ]);

    const result = await autoCompleteChainOrders();
    expect(result.candidates).toBe(0);
  });

  it("skips orders with no companionEndedAt", async () => {
    const orders = [makeOrder({ orderId: "10", status: 2, finishAt: "0" })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockListChainOrdersForAutoFinalize.mockResolvedValue([{ id: "10", source: "chain", meta: {} }]);

    const result = await autoCompleteChainOrders();
    expect(result.candidates).toBe(0);
  });

  it("skips orders where threshold not yet reached", async () => {
    const nowMs = Date.now();
    const endedAt = nowMs - 1000; // only 1 second ago, threshold is 72 hours
    const orders = [makeOrder({ orderId: "10", status: 2, finishAt: "0" })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockListChainOrdersForAutoFinalize.mockResolvedValue([
      { id: "10", source: "chain", meta: { companionEndedAt: endedAt } },
    ]);

    const result = await autoCompleteChainOrders();
    expect(result.candidates).toBe(0);
  });

  it("skips non-chain orders in buildCompanionEndedAtMap", async () => {
    const nowMs = Date.now();
    const endedAt = nowMs - 72 * 60 * 60 * 1000 - 1000;
    const orders = [makeOrder({ orderId: "10", status: 2, finishAt: "0" })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockListChainOrdersForAutoFinalize.mockResolvedValue([
      { id: "10", source: "manual", meta: { companionEndedAt: endedAt } }, // not chain
    ]);

    const result = await autoCompleteChainOrders();
    expect(result.candidates).toBe(0);
  });

  it("sorts candidates by companionEndedAt ascending", async () => {
    const nowMs = Date.now();
    const endedAt1 = nowMs - 72 * 60 * 60 * 1000 - 5000;
    const endedAt2 = nowMs - 72 * 60 * 60 * 1000 - 1000;
    const orders = [
      makeOrder({ orderId: "B", status: 2, finishAt: "0" }),
      makeOrder({ orderId: "A", status: 2, finishAt: "0" }),
    ];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockListChainOrdersForAutoFinalize.mockResolvedValue([
      { id: "B", source: "chain", meta: { companionEndedAt: endedAt2 } },
      { id: "A", source: "chain", meta: { companionEndedAt: endedAt1 } },
    ]);
    mockMarkCompletedAdmin.mockResolvedValue({ digest: "d1" });
    mockSyncChainOrder.mockResolvedValue(null);

    const result = await autoCompleteChainOrders();
    // A has earlier endedAt, should be completed first
    expect(result.completedIds[0]).toBe("A");
    expect(result.completedIds[1]).toBe("B");
  });

  it("records failures when markCompleted throws", async () => {
    const nowMs = Date.now();
    const endedAt = nowMs - 72 * 60 * 60 * 1000 - 1000;
    const orders = [makeOrder({ orderId: "20", status: 2, finishAt: "0" })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockListChainOrdersForAutoFinalize.mockResolvedValue([
      { id: "20", source: "chain", meta: { companionEndedAt: endedAt } },
    ]);
    mockMarkCompletedAdmin.mockRejectedValue(new Error("chain error"));

    const result = await autoCompleteChainOrders();
    expect(result.failures.length).toBe(1);
    expect(result.failures[0].orderId).toBe("20");
  });

  it("respects custom limit", async () => {
    const nowMs = Date.now();
    const endedAt = nowMs - 72 * 60 * 60 * 1000 - 1000;
    const orders = [
      makeOrder({ orderId: "1", status: 2, finishAt: "0" }),
      makeOrder({ orderId: "2", status: 2, finishAt: "0" }),
    ];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockListChainOrdersForAutoFinalize.mockResolvedValue([
      { id: "1", source: "chain", meta: { companionEndedAt: endedAt } },
      { id: "2", source: "chain", meta: { companionEndedAt: endedAt } },
    ]);
    mockMarkCompletedAdmin.mockResolvedValue({ digest: "d1" });
    mockSyncChainOrder.mockResolvedValue(null);

    const result = await autoCompleteChainOrders({ limit: 1 });
    expect(result.candidates).toBeLessThanOrEqual(1);
  });
});

// ── autoFinalizeChainOrders ──

describe("autoFinalizeChainOrders", () => {
  it("returns disabled result when config is disabled", async () => {
    const envMod = await import("@/lib/env");
    const original = envMod.env.CHAIN_ORDER_AUTO_FINALIZE_MAX;
    (envMod.env as Record<string, unknown>).CHAIN_ORDER_AUTO_FINALIZE_MAX = 0;

    const result = await autoFinalizeChainOrders();
    expect(result.enabled).toBe(false);
    expect(result.finalized).toBe(0);

    (envMod.env as Record<string, unknown>).CHAIN_ORDER_AUTO_FINALIZE_MAX = original;
  });

  it("returns dry run result without finalizing", async () => {
    const nowMs = Date.now();
    const orders = [makeOrder({ orderId: "1", status: 3, disputeDeadline: String(nowMs - 1000) })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);

    const result = await autoFinalizeChainOrders({ dryRun: true });
    expect(result.enabled).toBe(true);
    expect(result.candidates).toBe(1);
    expect(result.finalized).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockFinalizeNoDisputeAdmin).not.toHaveBeenCalled();
  });

  it("finalizes eligible orders", async () => {
    const nowMs = Date.now();
    const orders = [makeOrder({ orderId: "30", status: 3, disputeDeadline: String(nowMs - 1000) })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockFinalizeNoDisputeAdmin.mockResolvedValue({ digest: "d1" });
    mockSyncChainOrder.mockResolvedValue(null);

    const result = await autoFinalizeChainOrders();
    expect(result.finalized).toBe(1);
    expect(result.finalizedIds).toEqual(["30"]);
  });

  it("skips orders not in COMPLETED status", async () => {
    const nowMs = Date.now();
    const orders = [makeOrder({ orderId: "30", status: 2, disputeDeadline: String(nowMs - 1000) })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);

    const result = await autoFinalizeChainOrders();
    expect(result.candidates).toBe(0);
  });

  it("skips orders with future dispute deadline", async () => {
    const nowMs = Date.now();
    const orders = [
      makeOrder({ orderId: "30", status: 3, disputeDeadline: String(nowMs + 100000) }),
    ];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);

    const result = await autoFinalizeChainOrders();
    expect(result.candidates).toBe(0);
  });

  it("records failures when finalize throws", async () => {
    const nowMs = Date.now();
    const orders = [makeOrder({ orderId: "40", status: 3, disputeDeadline: String(nowMs - 1000) })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockFinalizeNoDisputeAdmin.mockRejectedValue(new Error("finalize error"));

    const result = await autoFinalizeChainOrders();
    expect(result.failures.length).toBe(1);
    expect(result.failures[0].error).toBe("finalize error");
  });

  it("respects custom limit", async () => {
    const nowMs = Date.now();
    const orders = [
      makeOrder({ orderId: "50", status: 3, disputeDeadline: String(nowMs - 2000) }),
      makeOrder({ orderId: "51", status: 3, disputeDeadline: String(nowMs - 1000) }),
    ];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockFinalizeNoDisputeAdmin.mockResolvedValue({ digest: "d1" });
    mockSyncChainOrder.mockResolvedValue(null);

    const result = await autoFinalizeChainOrders({ limit: 1 });
    expect(result.candidates).toBeLessThanOrEqual(1);
    expect(result.finalized).toBeLessThanOrEqual(1);
  });

  it("sorts candidates by disputeDeadline ascending", async () => {
    const nowMs = Date.now();
    const orders = [
      makeOrder({ orderId: "B", status: 3, disputeDeadline: String(nowMs - 1000) }),
      makeOrder({ orderId: "A", status: 3, disputeDeadline: String(nowMs - 5000) }),
    ];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockFinalizeNoDisputeAdmin.mockResolvedValue({ digest: "d1" });
    mockSyncChainOrder.mockResolvedValue(null);

    const result = await autoFinalizeChainOrders();
    // A has earlier deadline, should be finalized first
    expect(result.finalizedIds[0]).toBe("A");
    expect(result.finalizedIds[1]).toBe("B");
  });
});

// ── autoFinalizeChainOrdersSummary ──

describe("autoFinalizeChainOrdersSummary", () => {
  it("returns combined summary", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([]);
    mockListChainOrdersForAutoFinalize.mockResolvedValue([]);

    const summary = await autoFinalizeChainOrdersSummary();
    expect(summary).toHaveProperty("complete");
    expect(summary).toHaveProperty("finalize");
    expect(summary.complete.enabled).toBe(true);
    expect(summary.finalize.enabled).toBe(true);
  });

  it("passes dryRun option to both", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([]);
    mockListChainOrdersForAutoFinalize.mockResolvedValue([]);

    const summary = await autoFinalizeChainOrdersSummary({ dryRun: true });
    expect(summary.complete.completed).toBe(0);
    expect(summary.finalize.finalized).toBe(0);
  });

  it("passes custom limits", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([]);
    mockListChainOrdersForAutoFinalize.mockResolvedValue([]);

    const summary = await autoFinalizeChainOrdersSummary({
      completeLimit: 5,
      finalizeLimit: 10,
    });
    expect(summary.complete.enabled).toBe(true);
    expect(summary.finalize.enabled).toBe(true);
  });
});
