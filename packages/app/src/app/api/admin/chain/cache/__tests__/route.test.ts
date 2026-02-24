import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockGetCacheStats,
  mockClearCache,
  mockGetChainOrderStats,
  mockFetchChainOrdersCached,
  mockEnv,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetCacheStats: vi.fn(),
  mockClearCache: vi.fn(),
  mockGetChainOrderStats: vi.fn(),
  mockFetchChainOrdersCached: vi.fn(),
  mockEnv: {
    CHAIN_ORDER_CACHE_TTL_MS: 30000,
    CHAIN_ORDER_MAX_CACHE_AGE_MS: 300000,
    ADMIN_CHAIN_EVENT_LIMIT: 1000,
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/chain/chain-order-cache", () => ({
  getCacheStats: mockGetCacheStats,
  clearCache: mockClearCache,
  getChainOrderStats: mockGetChainOrderStats,
}));
vi.mock("@/lib/chain/chain-sync", () => ({ fetchChainOrdersCached: mockFetchChainOrdersCached }));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

import { GET, DELETE, POST } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

const defaultStats = {
  orderCount: 10,
  cacheAgeMs: 5000,
  lastFetch: Date.now(),
  hits: 5,
  misses: 2,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockGetCacheStats.mockReturnValue(defaultStats);
});

describe("GET /api/admin/chain/cache", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(new Request("http://localhost/api/admin/chain/cache"));
    expect(res.status).toBe(401);
  });

  it("returns cache stats", async () => {
    const res = await GET(new Request("http://localhost/api/admin/chain/cache"));
    const json = await res.json();
    expect(json.cache.orderCount).toBe(10);
    expect(json.status).toBe("fresh");
  });

  it("returns empty status when cacheAgeMs is null", async () => {
    mockGetCacheStats.mockReturnValue({ ...defaultStats, cacheAgeMs: null });
    const res = await GET(new Request("http://localhost/api/admin/chain/cache"));
    const json = await res.json();
    expect(json.status).toBe("empty");
  });

  it("returns stale status when cacheAgeMs is between 30s and 300s", async () => {
    mockGetCacheStats.mockReturnValue({ ...defaultStats, cacheAgeMs: 60000 });
    const res = await GET(new Request("http://localhost/api/admin/chain/cache"));
    const json = await res.json();
    expect(json.status).toBe("stale");
  });

  it("returns expired status when cacheAgeMs is over 300s", async () => {
    mockGetCacheStats.mockReturnValue({ ...defaultStats, cacheAgeMs: 400000 });
    const res = await GET(new Request("http://localhost/api/admin/chain/cache"));
    const json = await res.json();
    expect(json.status).toBe("expired");
  });

  it("computes hitRate correctly", async () => {
    mockGetCacheStats.mockReturnValue({ ...defaultStats, hits: 0, misses: 0 });
    const res = await GET(new Request("http://localhost/api/admin/chain/cache"));
    const json = await res.json();
    expect(json.cache.hitRate).toBe(0);
  });

  it("includes config values", async () => {
    const res = await GET(new Request("http://localhost/api/admin/chain/cache"));
    const json = await res.json();
    expect(json.config.cacheTtlMs).toBe(30000);
    expect(json.config.eventLimit).toBe(1000);
  });
});

describe("DELETE /api/admin/chain/cache", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await DELETE(
      new Request("http://localhost/api/admin/chain/cache", { method: "DELETE" })
    );
    expect(res.status).toBe(401);
  });

  it("clears cache and returns result", async () => {
    const res = await DELETE(
      new Request("http://localhost/api/admin/chain/cache", { method: "DELETE" })
    );
    const json = await res.json();
    expect(mockClearCache).toHaveBeenCalled();
    expect(json.message).toBe("缓存已清空");
  });
});

describe("POST /api/admin/chain/cache", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(
      new Request("http://localhost/api/admin/chain/cache", { method: "POST" })
    );
    expect(res.status).toBe(401);
  });

  it("refreshes cache and returns stats", async () => {
    mockFetchChainOrdersCached.mockResolvedValue([{ orderId: "1" }]);
    mockGetChainOrderStats.mockResolvedValue({
      byStatus: {},
      newestOrder: null,
      oldestOrder: null,
    });
    const res = await POST(
      new Request("http://localhost/api/admin/chain/cache", { method: "POST" })
    );
    const json = await res.json();
    expect(json.message).toBe("缓存已刷新");
    expect(json.orderCount).toBe(1);
  });

  it("includes newest and oldest order in stats", async () => {
    mockFetchChainOrdersCached.mockResolvedValue([{ orderId: "1" }, { orderId: "2" }]);
    mockGetChainOrderStats.mockResolvedValue({
      byStatus: { 1: 2 },
      newestOrder: { orderId: "2", status: 1, createdAt: 2000 },
      oldestOrder: { orderId: "1", status: 1, createdAt: 1000 },
    });
    const res = await POST(
      new Request("http://localhost/api/admin/chain/cache", { method: "POST" })
    );
    const json = await res.json();
    expect(json.orderStats.newest.orderId).toBe("2");
    expect(json.orderStats.oldest.orderId).toBe("1");
  });
});
