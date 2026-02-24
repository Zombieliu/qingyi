import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockFetchChainOrdersCached,
  mockGetChainOrderCacheStats,
  mockUpsertChainOrder,
  mockGetChainOrderStats,
  mockPrisma,
  mockTrackCronCompleted,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockFetchChainOrdersCached: vi.fn(),
  mockGetChainOrderCacheStats: vi.fn(),
  mockUpsertChainOrder: vi.fn(),
  mockGetChainOrderStats: vi.fn(),
  mockPrisma: { adminOrder: { findMany: vi.fn() } },
  mockTrackCronCompleted: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/chain/chain-sync", () => ({
  fetchChainOrdersCached: mockFetchChainOrdersCached,
  getChainOrderCacheStats: mockGetChainOrderCacheStats,
  upsertChainOrder: mockUpsertChainOrder,
}));
vi.mock("@/lib/chain/chain-order-cache", () => ({ getChainOrderStats: mockGetChainOrderStats }));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/business-events", () => ({ trackCronCompleted: mockTrackCronCompleted }));

import { GET, POST } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makeGet(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/chain/reconcile");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function makePost(body: unknown) {
  return new Request("http://localhost/api/admin/chain/reconcile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockGetChainOrderCacheStats.mockReturnValue({
    cacheAgeMs: 1000,
    hits: 1,
    misses: 0,
    lastFetch: Date.now(),
  });
});

describe("GET /api/admin/chain/reconcile", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("returns reconcile summary", async () => {
    mockFetchChainOrdersCached.mockResolvedValue([]);
    mockPrisma.adminOrder.findMany.mockResolvedValue([]);
    mockGetChainOrderStats.mockResolvedValue({ byStatus: {} });
    const res = await GET(makeGet());
    const json = await res.json();
    expect(json.summary).toBeTruthy();
    expect(json.summary.health.status).toBe("healthy");
  });

  it("returns detailed info when detailed=true", async () => {
    mockFetchChainOrdersCached.mockResolvedValue([
      { orderId: "chain-1", status: 1 },
      { orderId: "chain-2", status: 2 },
    ]);
    mockPrisma.adminOrder.findMany.mockResolvedValue([
      {
        id: "chain-2",
        chainStatus: 1,
        stage: "进行中",
        paymentStatus: null,
        source: "chain",
        userAddress: "0x1",
        companionAddress: "0x2",
        serviceFee: 0,
        deposit: 0,
        createdAt: new Date(),
      },
      {
        id: "local-only",
        chainStatus: null,
        stage: "进行中",
        paymentStatus: null,
        source: "chain",
        userAddress: "0x3",
        companionAddress: "0x4",
        serviceFee: 0,
        deposit: 0,
        createdAt: new Date(),
      },
    ]);
    mockGetChainOrderStats.mockResolvedValue({ byStatus: { 1: 1, 2: 1 } });
    const res = await GET(makeGet({ detailed: "true" }));
    const json = await res.json();
    expect(json.details).toBeDefined();
    expect(json.details.missingInLocal).toContain("chain-1");
    expect(json.details.missingInChain).toContain("local-only");
    expect(json.details.statusMismatch.length).toBe(1);
    expect(json.summary.health.status).toBe("needs_attention");
  });
});

describe("POST /api/admin/chain/reconcile", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePost({ action: "sync_missing" }));
    expect(res.status).toBe(401);
  });

  it("syncs missing orders", async () => {
    mockFetchChainOrdersCached.mockResolvedValue([{ orderId: "1", status: 1 }]);
    mockPrisma.adminOrder.findMany.mockResolvedValue([]);
    mockUpsertChainOrder.mockResolvedValue(undefined);
    const res = await POST(makePost({ action: "sync_missing" }));
    const json = await res.json();
    expect(json.synced).toBe(1);
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(makePost({ action: "invalid_action" }));
    expect(res.status).toBe(400);
  });

  it("handles upsert error during sync_missing", async () => {
    mockFetchChainOrdersCached.mockResolvedValue([{ orderId: "1", status: 1 }]);
    mockPrisma.adminOrder.findMany.mockResolvedValue([]);
    mockUpsertChainOrder.mockRejectedValue(new Error("db error"));
    const res = await POST(makePost({ action: "sync_missing" }));
    const json = await res.json();
    expect(json.synced).toBe(0);
    expect(json.errors).toBe(1);
    expect(json.errorDetails[0]).toContain("db error");
  });

  it("fixes status mismatches with fix_status action", async () => {
    mockFetchChainOrdersCached.mockResolvedValue([{ orderId: "order-1", status: 2 }]);
    mockPrisma.adminOrder.findMany.mockResolvedValue([{ id: "order-1", chainStatus: 1 }]);
    mockUpsertChainOrder.mockResolvedValue(undefined);
    const res = await POST(makePost({ action: "fix_status" }));
    const json = await res.json();
    expect(json.fixed).toBe(1);
    expect(mockUpsertChainOrder).toHaveBeenCalled();
  });

  it("handles upsert error during fix_status", async () => {
    mockFetchChainOrdersCached.mockResolvedValue([{ orderId: "order-1", status: 2 }]);
    mockPrisma.adminOrder.findMany.mockResolvedValue([{ id: "order-1", chainStatus: 1 }]);
    mockUpsertChainOrder.mockRejectedValue(new Error("fix error"));
    const res = await POST(makePost({ action: "fix_status" }));
    const json = await res.json();
    expect(json.fixed).toBe(0);
    expect(json.errors).toBe(1);
    expect(json.errorDetails[0]).toContain("fix error");
  });

  it("sync_all does both sync_missing and fix_status", async () => {
    mockFetchChainOrdersCached.mockResolvedValue([
      { orderId: "new-1", status: 1 },
      { orderId: "existing-1", status: 2 },
    ]);
    mockPrisma.adminOrder.findMany.mockResolvedValue([{ id: "existing-1", chainStatus: 1 }]);
    mockUpsertChainOrder.mockResolvedValue(undefined);
    const res = await POST(makePost({ action: "sync_all" }));
    const json = await res.json();
    expect(json.synced).toBe(1);
    expect(json.fixed).toBe(1);
  });
});
