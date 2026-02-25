import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireUserAuth: vi.fn(),
  findChainOrder: vi.fn(),
  findChainOrderDirect: vi.fn(),
  findChainOrderFromDigest: vi.fn(),
  upsertChainOrder: vi.fn(),
  getChainOrderCacheStats: vi.fn(),
  clearChainOrderCache: vi.fn(),
  getOrderById: vi.fn(),
  updateOrder: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
  parseBodyRaw: vi.fn(),
  env: {
    ADMIN_CHAIN_EVENT_LIMIT: 100,
    SUI_NETWORK: "testnet",
  },
}));

vi.mock("next/server", () => {
  class MockNextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map();
    }
    async json() {
      return this.body;
    }
    static json(data: unknown, init?: { status?: number }) {
      return new MockNextResponse(data, init);
    }
  }
  return { NextResponse: MockNextResponse };
});

vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/auth/user-auth", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("@/lib/chain/chain-sync", () => ({
  findChainOrder: mocks.findChainOrder,
  findChainOrderDirect: mocks.findChainOrderDirect,
  findChainOrderFromDigest: mocks.findChainOrderFromDigest,
  upsertChainOrder: mocks.upsertChainOrder,
  getChainOrderCacheStats: mocks.getChainOrderCacheStats,
  clearChainOrderCache: mocks.clearChainOrderCache,
}));
vi.mock("@/lib/admin/admin-store", () => ({
  getOrderById: mocks.getOrderById,
  updateOrder: mocks.updateOrder,
}));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));
vi.mock("@/lib/shared/api-validation", () => ({
  parseBodyRaw: mocks.parseBodyRaw,
}));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/shared/api-response", () => ({
  apiBadRequest: (error: string) => NextResponse.json({ error }, { status: 400 }),
  apiUnauthorized: (error = "unauthorized") => NextResponse.json({ error }, { status: 401 }),
  apiForbidden: (error = "forbidden") => NextResponse.json({ error }, { status: 403 }),
  apiNotFound: (error = "not_found") => NextResponse.json({ error }, { status: 404 }),
}));

// Re-import NextResponse from the mock for api-response mock usage
const { NextResponse } = await import("next/server");

import { POST } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

const chainOrder = {
  orderId: "ORD-001",
  user: VALID_ADDRESS,
  companion: "0x" + "b".repeat(64),
  status: 1,
};

function makeCtx(orderId: string) {
  return { params: Promise.resolve({ orderId }) };
}

function makeReq(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("POST /api/orders/[orderId]/chain-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
    mocks.getChainOrderCacheStats.mockReturnValue({
      orderCount: 0,
      cacheAgeMs: 0,
      lastFetch: null,
    });
    mocks.parseBodyRaw.mockResolvedValue({ success: true, data: {}, rawBody: "{}" });
  });

  it("returns 400 for missing orderId", async () => {
    const req = makeReq("http://localhost/api/orders//chain-sync", { method: "POST" });
    const res = await POST(req, makeCtx(""));
    expect(res.status).toBe(400);
  });

  it("syncs chain order as admin", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.findChainOrder.mockResolvedValue(chainOrder);
    mocks.upsertChainOrder.mockResolvedValue({ ...chainOrder, chainDigest: "abc" });
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.syncedFrom).toBe("chain");
  });

  it("returns 401 when non-admin has no userAddress", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.findChainOrder.mockResolvedValue(chainOrder);
    mocks.parseBodyRaw.mockResolvedValue({ success: true, data: {}, rawBody: "{}" });
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when user is not order participant", async () => {
    const thirdAddr = "0x" + "c".repeat(64);
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.findChainOrder.mockResolvedValue(chainOrder);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: thirdAddr },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid userAddress", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.findChainOrder.mockResolvedValue(chainOrder);
    mocks.isValidSuiAddress.mockReturnValue(false);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: "bad" },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(400);
  });

  it("returns 404 when chain order not found after retries", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.findChainOrder.mockResolvedValue(null);
    mocks.findChainOrderDirect.mockResolvedValue(null);
    mocks.getOrderById.mockResolvedValue(null);
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync?force=1&maxWaitMs=0", {
      method: "POST",
    });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("chain_order_not_found");
  });

  it("user auth succeeds for order participant", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.findChainOrder.mockResolvedValue(chainOrder);
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.upsertChainOrder.mockResolvedValue(chainOrder);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: VALID_ADDRESS },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
  });

  it("returns validation error for invalid body", async () => {
    const errResp = { status: 400, json: async () => ({ error: "Invalid JSON" }) };
    mocks.parseBodyRaw.mockResolvedValue({ success: false, response: errResp });
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync", {
      method: "POST",
      body: "bad",
    });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(400);
  });

  it("clears cache and retries when force=1", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.findChainOrder.mockResolvedValue(chainOrder);
    mocks.upsertChainOrder.mockResolvedValue(chainOrder);
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync?force=1", {
      method: "POST",
    });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
    expect(mocks.clearChainOrderCache).toHaveBeenCalled();
  });

  it("uses digest from query param to find chain order", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.findChainOrder.mockResolvedValue(null);
    mocks.findChainOrderFromDigest.mockResolvedValue({ ...chainOrder, status: 2 });
    mocks.findChainOrderDirect.mockResolvedValue(null);
    mocks.getOrderById.mockResolvedValue({
      id: "ORD-001",
      userAddress: VALID_ADDRESS,
      companionAddress: null,
      serviceFee: 10,
      deposit: 50,
      createdAt: 1000,
      meta: { chain: { ruleSetId: 1 } },
      source: "app",
    });
    mocks.upsertChainOrder.mockResolvedValue({ ...chainOrder, status: 2 });
    const req = makeReq(
      "http://localhost/api/orders/ORD-001/chain-sync?force=1&maxWaitMs=0&digest=0xabc",
      { method: "POST" }
    );
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
    expect(mocks.findChainOrderFromDigest).toHaveBeenCalled();
  });

  it("uses digest from body to find chain order", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.findChainOrder.mockResolvedValue(null);
    mocks.findChainOrderFromDigest.mockResolvedValue({ ...chainOrder, status: 2 });
    mocks.findChainOrderDirect.mockResolvedValue(null);
    mocks.getOrderById.mockResolvedValue(null);
    mocks.upsertChainOrder.mockResolvedValue({ ...chainOrder, status: 2 });
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { digest: "0xbody" },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync?force=1&maxWaitMs=0", {
      method: "POST",
    });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
  });

  it("prefers digest with higher status over initial chain result", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.findChainOrder.mockResolvedValue({ ...chainOrder, status: 1 });
    mocks.findChainOrderFromDigest.mockResolvedValue({ ...chainOrder, status: 3 });
    mocks.getOrderById.mockResolvedValue(null);
    mocks.upsertChainOrder.mockResolvedValue({ ...chainOrder, status: 3 });
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync?digest=0xabc", {
      method: "POST",
    });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.chainStatus).toBe(3);
  });

  it("ignores digest parse errors gracefully", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.findChainOrder.mockResolvedValue(chainOrder);
    mocks.findChainOrderFromDigest.mockRejectedValue(new Error("parse error"));
    mocks.getOrderById.mockResolvedValue(null);
    mocks.upsertChainOrder.mockResolvedValue(chainOrder);
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync?digest=0xbad", {
      method: "POST",
    });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
  });

  it("retries finding chain order with delays", async () => {
    vi.useFakeTimers();
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    let callCount = 0;
    mocks.findChainOrder.mockImplementation(async () => {
      callCount++;
      if (callCount >= 3) return chainOrder;
      return null;
    });
    mocks.findChainOrderDirect.mockResolvedValue(null);
    mocks.upsertChainOrder.mockResolvedValue(chainOrder);
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync?maxWaitMs=10000", {
      method: "POST",
    });
    const promise = POST(req, makeCtx("ORD-001"));
    // Advance timers for retry delays
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(4000);
    const res = await promise;
    expect(res.status).toBe(200);
    vi.useRealTimers();
  });

  it("falls back to findChainOrderDirect when force and retries fail", async () => {
    vi.useFakeTimers();
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.findChainOrder.mockResolvedValue(null);
    mocks.findChainOrderDirect.mockResolvedValue(chainOrder);
    mocks.upsertChainOrder.mockResolvedValue(chainOrder);
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync?force=1&maxWaitMs=0", {
      method: "POST",
    });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
    expect(mocks.findChainOrderDirect).toHaveBeenCalledWith("ORD-001");
    vi.useRealTimers();
  });

  it("persists digest when synced order has no chainDigest", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.findChainOrder.mockResolvedValue(chainOrder);
    mocks.upsertChainOrder.mockResolvedValue({ ...chainOrder, chainDigest: undefined });
    mocks.findChainOrderFromDigest.mockResolvedValue({ ...chainOrder });
    mocks.getOrderById.mockResolvedValue(null);
    mocks.updateOrder.mockResolvedValue({});
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync?digest=0xdigest123", {
      method: "POST",
    });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
    expect(mocks.updateOrder).toHaveBeenCalledWith("ORD-001", { chainDigest: "0xdigest123" });
  });

  it("does not persist digest when synced order already has chainDigest", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.findChainOrder.mockResolvedValue(chainOrder);
    mocks.upsertChainOrder.mockResolvedValue({ ...chainOrder, chainDigest: "existing" });
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync?digest=0xdigest123", {
      method: "POST",
    });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
    expect(mocks.updateOrder).not.toHaveBeenCalled();
  });

  it("ignores digest persistence failures", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.findChainOrder.mockResolvedValue(chainOrder);
    mocks.upsertChainOrder.mockResolvedValue({ ...chainOrder, chainDigest: undefined });
    mocks.findChainOrderFromDigest.mockRejectedValue(new Error("fail"));
    mocks.getOrderById.mockResolvedValue(null);
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync?digest=0xdigest123", {
      method: "POST",
    });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
  });

  it("returns user auth error when auth fails", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.findChainOrder.mockResolvedValue(chainOrder);
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: VALID_ADDRESS },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(401);
  });

  it("companion address can also sync chain order", async () => {
    const companionAddr = "0x" + "b".repeat(64);
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.findChainOrder.mockResolvedValue(chainOrder);
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.upsertChainOrder.mockResolvedValue(chainOrder);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: companionAddr },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync", { method: "POST" });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
  });

  it("returns 404 with detailed error info when all retries fail", async () => {
    vi.useFakeTimers();
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.findChainOrder.mockResolvedValue(null);
    mocks.findChainOrderDirect.mockResolvedValue(null);
    mocks.getOrderById.mockResolvedValue({ id: "ORD-001", source: "app" });
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync?force=1&maxWaitMs=0", {
      method: "POST",
    });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("chain_order_not_found");
    expect(body.details.existsInLocal).toBe(true);
    expect(body.details.localOrderSource).toBe("app");
    expect(body.details.forced).toBe(true);
    vi.useRealTimers();
  });

  it("falls back to digest after retries fail", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.findChainOrder.mockResolvedValue(null);
    mocks.findChainOrderDirect.mockResolvedValue(null);
    mocks.findChainOrderFromDigest
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...chainOrder, status: 2 });
    mocks.getOrderById.mockResolvedValue(null);
    mocks.upsertChainOrder.mockResolvedValue({ ...chainOrder, status: 2 });
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { digest: "0xfallback" },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync?force=1&maxWaitMs=0", {
      method: "POST",
    });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
  });

  it("digest fallback returns null when orderId does not match", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.findChainOrder.mockResolvedValue(null);
    mocks.findChainOrderDirect.mockResolvedValue(null);
    mocks.findChainOrderFromDigest.mockResolvedValue({
      ...chainOrder,
      orderId: "OTHER-ID",
      status: 2,
    });
    mocks.getOrderById.mockResolvedValue(null);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { digest: "0xfallback" },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001/chain-sync?force=1&maxWaitMs=0", {
      method: "POST",
    });
    const res = await POST(req, makeCtx("ORD-001"));
    expect(res.status).toBe(404);
  });
});
