import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  fetchChainOrdersCached: vi.fn(),
  getChainOrderCacheStats: vi.fn(),
  upsertChainOrder: vi.fn(),
  getChainOrderStats: vi.fn(),
  listChainReconcileOrdersEdgeRead: vi.fn(),
  listChainReconcileStatusRowsEdgeRead: vi.fn(),
  trackCronCompleted: vi.fn(),
}));

vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/chain/chain-sync", () => ({
  fetchChainOrdersCached: mocks.fetchChainOrdersCached,
  getChainOrderCacheStats: mocks.getChainOrderCacheStats,
  upsertChainOrder: mocks.upsertChainOrder,
}));
vi.mock("@/lib/chain/chain-order-cache", () => ({ getChainOrderStats: mocks.getChainOrderStats }));
vi.mock("@/lib/edge-db/cron-maintenance-store", () => ({
  listChainReconcileOrdersEdgeRead: mocks.listChainReconcileOrdersEdgeRead,
  listChainReconcileStatusRowsEdgeRead: mocks.listChainReconcileStatusRowsEdgeRead,
}));
vi.mock("@/lib/business-events", () => ({ trackCronCompleted: mocks.trackCronCompleted }));

import { GET, POST } from "../route";

function makePost(body: unknown) {
  return new Request("http://localhost/api/admin/chain/reconcile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/admin/chain/reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ ok: true, role: "admin", authType: "session" });
    mocks.fetchChainOrdersCached.mockResolvedValue([]);
    mocks.getChainOrderStats.mockResolvedValue({ byStatus: {} });
    mocks.getChainOrderCacheStats.mockReturnValue({
      cacheAgeMs: 1_000,
      hits: 2,
      misses: 1,
      lastFetch: Date.now(),
    });
    mocks.listChainReconcileOrdersEdgeRead.mockResolvedValue([]);
    mocks.listChainReconcileStatusRowsEdgeRead.mockResolvedValue([]);
    mocks.upsertChainOrder.mockResolvedValue(undefined);
  });

  it("GET returns 401 when auth fails", async () => {
    mocks.requireAdmin.mockResolvedValueOnce({
      ok: false,
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    });

    const res = await GET(new Request("http://localhost/api/admin/chain/reconcile"));
    expect(res.status).toBe(401);
  });

  it("GET returns detailed discrepancy info", async () => {
    mocks.fetchChainOrdersCached.mockResolvedValue([
      { orderId: "chain-1", status: 1 },
      { orderId: "chain-2", status: 2 },
    ]);
    mocks.getChainOrderStats.mockResolvedValue({ byStatus: { 1: 1, 2: 1 } });
    mocks.listChainReconcileOrdersEdgeRead.mockResolvedValue([
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
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
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
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ]);

    const res = await GET(
      new Request("http://localhost/api/admin/chain/reconcile?detailed=true&refresh=true")
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.health.status).toBe("needs_attention");
    expect(body.details.missingInLocal).toEqual(["chain-1"]);
    expect(body.details.missingInChain).toEqual(["local-only"]);
    expect(body.details.statusMismatch).toHaveLength(1);
  });

  it("POST sync_missing upserts missing chain orders", async () => {
    mocks.fetchChainOrdersCached.mockResolvedValue([{ orderId: "chain-1", status: 1 }]);
    mocks.listChainReconcileStatusRowsEdgeRead.mockResolvedValue([]);

    const res = await POST(makePost({ action: "sync_missing" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ action: "sync_missing", synced: 1, fixed: 0, errors: 0 });
    expect(mocks.upsertChainOrder).toHaveBeenCalledWith({ orderId: "chain-1", status: 1 });
    expect(mocks.trackCronCompleted).toHaveBeenCalled();
  });

  it("POST fix_status reports errors when upsert fails", async () => {
    mocks.fetchChainOrdersCached.mockResolvedValue([{ orderId: "chain-1", status: 2 }]);
    mocks.listChainReconcileStatusRowsEdgeRead.mockResolvedValue([
      { id: "chain-1", chainStatus: 1 },
    ]);
    mocks.upsertChainOrder.mockRejectedValue(new Error("upsert failed"));

    const res = await POST(makePost({ action: "fix_status" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.errors).toBe(1);
    expect(body.errorDetails[0]).toContain("upsert failed");
  });
});
