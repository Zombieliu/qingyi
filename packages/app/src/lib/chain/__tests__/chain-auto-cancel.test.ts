import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──
const mockFetchChainOrdersAdmin = vi.fn();
const mockCancelOrderAdmin = vi.fn();
vi.mock("../chain-admin", () => ({
  fetchChainOrdersAdmin: (...a: unknown[]) => mockFetchChainOrdersAdmin(...a),
  cancelOrderAdmin: (...a: unknown[]) => mockCancelOrderAdmin(...a),
}));

const mockSyncChainOrder = vi.fn();
vi.mock("../chain-sync", () => ({
  syncChainOrder: (...a: unknown[]) => mockSyncChainOrder(...a),
}));

const mockIsChainOrderAutoCancelable = vi.fn();
const mockPickAutoCancelableOrders = vi.fn();
vi.mock("../chain-order-utils", () => ({
  isChainOrderAutoCancelable: (...a: unknown[]) => mockIsChainOrderAutoCancelable(...a),
  pickAutoCancelableOrders: (...a: unknown[]) => mockPickAutoCancelableOrders(...a),
}));

vi.mock("@/lib/env", () => ({
  env: {
    CHAIN_ORDER_AUTO_CANCEL_HOURS: 24,
    CHAIN_ORDER_AUTO_CANCEL_MAX: 50,
  },
}));

import {
  getAutoCancelConfig,
  autoCancelChainOrders,
  countAutoCancelableOrders,
  type AutoCancelConfig,
} from "../chain-auto-cancel";
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
    status: 0,
    createdAt: String(Date.now() - 100_000_000),
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

describe("getAutoCancelConfig", () => {
  it("returns enabled config when hours > 0", () => {
    const config = getAutoCancelConfig();
    expect(config.enabled).toBe(true);
    expect(config.hours).toBe(24);
    expect(config.max).toBe(50);
  });
});

describe("autoCancelChainOrders", () => {
  it("returns disabled result when config is disabled", async () => {
    // Override env to disable
    const envMod = await import("@/lib/env");
    const original = envMod.env.CHAIN_ORDER_AUTO_CANCEL_HOURS;
    (envMod.env as Record<string, unknown>).CHAIN_ORDER_AUTO_CANCEL_HOURS = 0;

    const result = await autoCancelChainOrders();
    expect(result.enabled).toBe(false);
    expect(result.canceled).toBe(0);

    (envMod.env as Record<string, unknown>).CHAIN_ORDER_AUTO_CANCEL_HOURS = original;
  });

  it("returns dry run result without canceling", async () => {
    const orders = [makeOrder({ orderId: "1" }), makeOrder({ orderId: "2" })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockPickAutoCancelableOrders.mockReturnValue([orders[0]]);

    const result = await autoCancelChainOrders({ dryRun: true });
    expect(result.enabled).toBe(true);
    expect(result.candidates).toBe(1);
    expect(result.canceled).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockCancelOrderAdmin).not.toHaveBeenCalled();
  });

  it("cancels eligible orders", async () => {
    const orders = [makeOrder({ orderId: "10" })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockPickAutoCancelableOrders.mockReturnValue(orders);
    mockIsChainOrderAutoCancelable.mockReturnValue(true);
    mockCancelOrderAdmin.mockResolvedValue({ digest: "d1" });
    mockSyncChainOrder.mockResolvedValue(null);

    const result = await autoCancelChainOrders();
    expect(result.canceled).toBe(1);
    expect(result.canceledIds).toEqual(["10"]);
    expect(mockCancelOrderAdmin).toHaveBeenCalledWith("10");
    expect(mockSyncChainOrder).toHaveBeenCalledWith("10");
  });

  it("skips orders that fail the re-check", async () => {
    const orders = [makeOrder({ orderId: "10" })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockPickAutoCancelableOrders.mockReturnValue(orders);
    mockIsChainOrderAutoCancelable.mockReturnValue(false);

    const result = await autoCancelChainOrders();
    expect(result.skipped).toBe(1);
    expect(result.canceled).toBe(0);
    expect(mockCancelOrderAdmin).not.toHaveBeenCalled();
  });

  it("records failures when cancel throws", async () => {
    const orders = [makeOrder({ orderId: "20" })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockPickAutoCancelableOrders.mockReturnValue(orders);
    mockIsChainOrderAutoCancelable.mockReturnValue(true);
    mockCancelOrderAdmin.mockRejectedValue(new Error("rpc error"));

    const result = await autoCancelChainOrders();
    expect(result.failures.length).toBe(1);
    expect(result.failures[0].orderId).toBe("20");
    expect(result.failures[0].error).toBe("rpc error");
  });

  it("respects custom limit option", async () => {
    const orders = [makeOrder({ orderId: "1" }), makeOrder({ orderId: "2" })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    mockPickAutoCancelableOrders.mockReturnValue([orders[0]]);
    mockIsChainOrderAutoCancelable.mockReturnValue(true);
    mockCancelOrderAdmin.mockResolvedValue({ digest: "d1" });
    mockSyncChainOrder.mockResolvedValue(null);

    const result = await autoCancelChainOrders({ limit: 1 });
    expect(result.candidates).toBe(1);
  });
});

describe("countAutoCancelableOrders", () => {
  it("counts cancelable orders", () => {
    mockIsChainOrderAutoCancelable.mockReturnValue(true);
    const orders = [makeOrder(), makeOrder()];
    const count = countAutoCancelableOrders(orders, Date.now(), 86400000);
    expect(count).toBe(2);
  });

  it("returns 0 for non-array input", () => {
    const count = countAutoCancelableOrders(null as unknown as ChainOrder[], Date.now(), 86400000);
    expect(count).toBe(0);
  });

  it("returns 0 when no orders match", () => {
    mockIsChainOrderAutoCancelable.mockReturnValue(false);
    const orders = [makeOrder()];
    const count = countAutoCancelableOrders(orders, Date.now(), 86400000);
    expect(count).toBe(0);
  });
});
