import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──
const mockFetchChainOrdersAdmin = vi.fn();
vi.mock("../chain-admin", () => ({
  fetchChainOrdersAdmin: (...a: unknown[]) => mockFetchChainOrdersAdmin(...a),
}));

vi.mock("../chain-order-logger", () => ({
  chainOrderLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/lib/env", () => ({
  env: {
    CHAIN_ORDER_CACHE_TTL_MS: 30000,
    CHAIN_ORDER_MAX_CACHE_AGE_MS: 300000,
  },
}));

import {
  getCacheStats,
  clearCache,
  fetchChainOrdersCached,
  findChainOrderCached,
  findChainOrdersBatch,
  chainOrderExists,
  getChainOrderStats,
} from "../chain-order-cache";
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
  clearCache();
});

// ── getCacheStats ──

describe("getCacheStats", () => {
  it("returns initial stats", () => {
    const stats = getCacheStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.lastFetch).toBeNull();
    expect(stats.orderCount).toBe(0);
    expect(stats.cacheAgeMs).toBeNull();
  });

  it("returns updated stats after fetch", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([makeOrder()]);
    await fetchChainOrdersCached();
    const stats = getCacheStats();
    expect(stats.misses).toBe(1);
    expect(stats.orderCount).toBe(1);
    expect(stats.lastFetch).not.toBeNull();
    expect(stats.cacheAgeMs).not.toBeNull();
  });
});

// ── clearCache ──

describe("clearCache", () => {
  it("resets all stats", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([makeOrder()]);
    await fetchChainOrdersCached();
    clearCache();
    const stats = getCacheStats();
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.orderCount).toBe(0);
  });
});

// ── fetchChainOrdersCached ──

describe("fetchChainOrdersCached", () => {
  it("fetches orders from chain on first call", async () => {
    const orders = [makeOrder({ orderId: "1" }), makeOrder({ orderId: "2" })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    const result = await fetchChainOrdersCached();
    expect(result.length).toBe(2);
    expect(mockFetchChainOrdersAdmin).toHaveBeenCalledTimes(1);
  });

  it("returns cached orders on subsequent calls within TTL", async () => {
    const orders = [makeOrder({ orderId: "1" })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    await fetchChainOrdersCached();
    await fetchChainOrdersCached();
    // Only one actual fetch
    expect(mockFetchChainOrdersAdmin).toHaveBeenCalledTimes(1);
  });

  it("force refresh bypasses cache", async () => {
    const orders = [makeOrder({ orderId: "1" })];
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    await fetchChainOrdersCached();
    await fetchChainOrdersCached(true);
    expect(mockFetchChainOrdersAdmin).toHaveBeenCalledTimes(2);
  });

  it("falls back to stale cache on error with force refresh", async () => {
    const orders = [makeOrder({ orderId: "1" })];
    mockFetchChainOrdersAdmin.mockResolvedValueOnce(orders);
    await fetchChainOrdersCached();

    // Force refresh triggers a new fetch; if it fails, should fall back to stale cache
    mockFetchChainOrdersAdmin.mockRejectedValueOnce(new Error("network error"));
    const result = await fetchChainOrdersCached(true);
    expect(result.length).toBe(1);
  });

  it("throws when refresh fails and no cache exists", async () => {
    mockFetchChainOrdersAdmin.mockRejectedValue(new Error("network error"));
    await expect(fetchChainOrdersCached()).rejects.toThrow("network error");
  });

  it("throws when refresh fails and cache is stale (exceeds MAX_CACHE_AGE)", async () => {
    // First populate cache
    const orders = [makeOrder({ orderId: "1" })];
    mockFetchChainOrdersAdmin.mockResolvedValueOnce(orders);
    await fetchChainOrdersCached();

    // Advance time past MAX_CACHE_AGE_MS (300000ms)
    const realDateNow = Date.now;
    Date.now = () => realDateNow() + 400_000;

    mockFetchChainOrdersAdmin.mockRejectedValueOnce(new Error("network error"));
    await expect(fetchChainOrdersCached(true)).rejects.toThrow("network error");

    Date.now = realDateNow;
  });
});

// ── findChainOrderCached ──

describe("findChainOrderCached", () => {
  it("finds an order by id", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([
      makeOrder({ orderId: "10" }),
      makeOrder({ orderId: "20" }),
    ]);
    const result = await findChainOrderCached("10");
    expect(result).not.toBeNull();
    expect(result!.orderId).toBe("10");
  });

  it("returns null for non-existent order", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([makeOrder({ orderId: "10" })]);
    const result = await findChainOrderCached("999");
    expect(result).toBeNull();
  });

  it("supports forceRefresh option", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([makeOrder({ orderId: "10" })]);
    await findChainOrderCached("10");
    await findChainOrderCached("10", { forceRefresh: true });
    expect(mockFetchChainOrdersAdmin).toHaveBeenCalledTimes(2);
  });
});

// ── findChainOrdersBatch ──

describe("findChainOrdersBatch", () => {
  it("returns map of found and not-found orders", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([
      makeOrder({ orderId: "1" }),
      makeOrder({ orderId: "2" }),
    ]);
    const result = await findChainOrdersBatch(["1", "3"]);
    expect(result.get("1")).not.toBeNull();
    expect(result.get("3")).toBeNull();
  });

  it("returns empty map for empty input", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([makeOrder({ orderId: "1" })]);
    const result = await findChainOrdersBatch([]);
    expect(result.size).toBe(0);
  });
});

// ── chainOrderExists ──

describe("chainOrderExists", () => {
  it("returns true for existing order", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([makeOrder({ orderId: "5" })]);
    const exists = await chainOrderExists("5");
    expect(exists).toBe(true);
  });

  it("returns false for non-existent order", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([makeOrder({ orderId: "5" })]);
    const exists = await chainOrderExists("999");
    expect(exists).toBe(false);
  });
});

// ── getChainOrderStats ──

describe("getChainOrderStats", () => {
  it("returns stats with status breakdown", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([
      makeOrder({ orderId: "1", status: 2 }),
      makeOrder({ orderId: "2", status: 2 }),
      makeOrder({ orderId: "3", status: 3 }),
    ]);
    const stats = await getChainOrderStats();
    expect(stats.totalOrders).toBe(3);
    expect(stats.byStatus[2]).toBe(2);
    expect(stats.byStatus[3]).toBe(1);
    expect(stats.recentOrders.length).toBe(3);
  });

  it("returns null for oldest/newest when no orders", async () => {
    mockFetchChainOrdersAdmin.mockResolvedValue([]);
    const stats = await getChainOrderStats();
    expect(stats.totalOrders).toBe(0);
    expect(stats.oldestOrder).toBeNull();
    expect(stats.newestOrder).toBeNull();
  });

  it("limits recentOrders to 10", async () => {
    const orders = Array.from({ length: 15 }, (_, i) => makeOrder({ orderId: String(i + 1) }));
    mockFetchChainOrdersAdmin.mockResolvedValue(orders);
    const stats = await getChainOrderStats();
    expect(stats.recentOrders.length).toBe(10);
  });
});
