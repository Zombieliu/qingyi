import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  addOrder: vi.fn(),
  getPlayerById: vi.fn(),
  getPlayerByAddress: vi.fn(),
  hasOrdersForAddress: vi.fn(),
  queryOrders: vi.fn(),
  queryPublicOrdersCursor: vi.fn(),
  requireAdmin: vi.fn(),
  requireUserAuth: vi.fn(),
  rateLimit: vi.fn(),
  clearChainOrderCache: vi.fn(),
  getCacheAsync: vi.fn(),
  setCache: vi.fn(),
  computeJsonEtag: vi.fn(),
  invalidateCacheByPrefix: vi.fn(),
  getIfNoneMatch: vi.fn(),
  jsonWithEtag: vi.fn(),
  notModified: vi.fn(),
  getClientIp: vi.fn(),
  formatFullDateTime: vi.fn(),
  parseBodyRaw: vi.fn(),
  trackOrderCreated: vi.fn(),
  trackWebhookFailed: vi.fn(),
  publishOrderEvent: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
  env: {
    ORDER_RATE_LIMIT_WINDOW_MS: 60000,
    ORDER_RATE_LIMIT_MAX: 30,
    PUBLIC_ORDER_RATE_LIMIT_MAX: 120,
    WECHAT_WEBHOOK_URL: "",
    E2E_SKIP_WEBHOOK: "1",
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

vi.mock("@/lib/admin/admin-store", () => ({
  addOrder: mocks.addOrder,
  getPlayerById: mocks.getPlayerById,
  getPlayerByAddress: mocks.getPlayerByAddress,
  hasOrdersForAddress: mocks.hasOrdersForAddress,
  queryOrders: mocks.queryOrders,
  queryPublicOrdersCursor: mocks.queryPublicOrdersCursor,
}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/auth/user-auth", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/chain/chain-sync", () => ({ clearChainOrderCache: mocks.clearChainOrderCache }));
vi.mock("@/lib/server-cache", () => ({
  getCacheAsync: mocks.getCacheAsync,
  setCache: mocks.setCache,
  computeJsonEtag: mocks.computeJsonEtag,
  invalidateCacheByPrefix: mocks.invalidateCacheByPrefix,
}));
vi.mock("@/lib/http-cache", () => ({
  getIfNoneMatch: mocks.getIfNoneMatch,
  jsonWithEtag: mocks.jsonWithEtag,
  notModified: mocks.notModified,
}));
vi.mock("@/lib/shared/api-utils", () => ({ getClientIp: mocks.getClientIp }));
vi.mock("@/lib/shared/date-utils", () => ({ formatFullDateTime: mocks.formatFullDateTime }));
vi.mock("@/lib/shared/api-validation", () => ({ parseBodyRaw: mocks.parseBodyRaw }));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/business-events", () => ({
  trackOrderCreated: mocks.trackOrderCreated,
  trackWebhookFailed: mocks.trackWebhookFailed,
}));
vi.mock("@/lib/realtime", () => ({ publishOrderEvent: mocks.publishOrderEvent }));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));

import { GET, POST } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

function createMockRequest(url: string, options?: RequestInit) {
  return new Request(url, options);
}

describe("GET /api/orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(true);
    mocks.getClientIp.mockReturnValue("127.0.0.1");
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.requireAdmin.mockResolvedValue({ ok: true, role: "admin" });
    mocks.getCacheAsync.mockResolvedValue(null);
    mocks.getIfNoneMatch.mockReturnValue("");
    mocks.computeJsonEtag.mockReturnValue('"etag1"');
  });

  it("returns orders for authenticated user with address", async () => {
    const result = { items: [], total: 0, page: 1, pageSize: 20 };
    mocks.queryOrders.mockResolvedValue(result);
    const req = createMockRequest(`http://localhost/api/orders?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(result);
  });

  it("returns 400 for invalid userAddress", async () => {
    mocks.isValidSuiAddress.mockReturnValue(false);
    const req = createMockRequest("http://localhost/api/orders?address=bad");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid userAddress");
  });

  it("requires admin auth when no address provided", async () => {
    mocks.normalizeSuiAddress.mockReturnValue("");
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = createMockRequest("http://localhost/api/orders");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = createMockRequest(`http://localhost/api/orders?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 429 for rate-limited public pool requests", async () => {
    mocks.rateLimit.mockResolvedValue(false);
    const req = createMockRequest(`http://localhost/api/orders?public=1&address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(429);
  });

  it("returns 401 when public pool has no address", async () => {
    mocks.rateLimit.mockResolvedValue(true);
    mocks.normalizeSuiAddress.mockReturnValue("");
    const req = createMockRequest("http://localhost/api/orders?public=1");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("address_required");
  });

  it("returns 403 when public pool user is not a player", async () => {
    mocks.getPlayerByAddress.mockResolvedValue({ player: null, conflict: false });
    const req = createMockRequest(`http://localhost/api/orders?public=1&address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("player_required");
  });

  it("returns 403 when player is disabled", async () => {
    mocks.getPlayerByAddress.mockResolvedValue({
      player: { status: "停用" },
      conflict: false,
    });
    const req = createMockRequest(`http://localhost/api/orders?public=1&address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns public orders with cursor pagination", async () => {
    mocks.getPlayerByAddress.mockResolvedValue({
      player: { status: "active", name: "Test" },
      conflict: false,
    });
    const mockResult = {
      items: [
        {
          id: "ORD-1",
          user: "u1",
          item: "item1",
          amount: 100,
          currency: "CNY",
          stage: "待处理",
          createdAt: Date.now(),
        },
      ],
      nextCursor: null,
    };
    mocks.queryPublicOrdersCursor.mockResolvedValue(mockResult);
    const mockEtagRes = { status: 200, json: async () => mockResult };
    mocks.jsonWithEtag.mockReturnValue(mockEtagRes);
    const req = createMockRequest(`http://localhost/api/orders?public=1&address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(mocks.queryPublicOrdersCursor).toHaveBeenCalled();
  });

  it("returns 400 for invalid cursor in public pool", async () => {
    mocks.getPlayerByAddress.mockResolvedValue({
      player: { status: "active" },
      conflict: false,
    });
    const req = createMockRequest(
      `http://localhost/api/orders?public=1&address=${VALID_ADDRESS}&cursor=invalid`
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_cursor");
  });

  it("returns cached public orders with etag match (304)", async () => {
    mocks.getPlayerByAddress.mockResolvedValue({
      player: { status: "active" },
      conflict: false,
    });
    mocks.getCacheAsync.mockResolvedValue({ etag: '"cached"', value: { items: [] } });
    mocks.getIfNoneMatch.mockReturnValue('"cached"');
    const mock304 = { status: 304 };
    mocks.notModified.mockReturnValue(mock304);
    const req = createMockRequest(`http://localhost/api/orders?public=1&address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(304);
  });

  it("respects page and pageSize params", async () => {
    mocks.queryOrders.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 });
    const req = createMockRequest(
      `http://localhost/api/orders?address=${VALID_ADDRESS}&page=2&pageSize=10`
    );
    await GET(req);
    expect(mocks.queryOrders).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10 })
    );
  });

  it("passes search query to queryOrders", async () => {
    mocks.queryOrders.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    const req = createMockRequest(`http://localhost/api/orders?address=${VALID_ADDRESS}&q=test`);
    await GET(req);
    expect(mocks.queryOrders).toHaveBeenCalledWith(expect.objectContaining({ q: "test" }));
  });
});

describe("POST /api/orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(true);
    mocks.getClientIp.mockReturnValue("127.0.0.1");
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.addOrder.mockResolvedValue(undefined);
    mocks.publishOrderEvent.mockResolvedValue(undefined);
    mocks.formatFullDateTime.mockReturnValue("2024-01-01 00:00:00");
  });

  it("returns 429 when rate limited", async () => {
    mocks.rateLimit.mockResolvedValue(false);
    const req = createMockRequest("http://localhost/api/orders", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
  });

  it("returns error for invalid body", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: false,
      response: { status: 400, json: async () => ({ error: "Invalid JSON" }) },
    });
    const req = createMockRequest("http://localhost/api/orders", {
      method: "POST",
      body: "bad",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 401 when userAddress is missing", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { user: "u1", item: "item1", amount: 100, currency: "CNY", status: "status.paid" },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("userAddress required");
  });

  it("returns 400 for invalid userAddress", async () => {
    mocks.isValidSuiAddress.mockReturnValue(false);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 100,
        currency: "CNY",
        status: "status.paid",
        userAddress: "bad",
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid userAddress");
  });

  it("returns 400 for invalid companionAddress", async () => {
    mocks.isValidSuiAddress.mockImplementation((a: string) => a === VALID_ADDRESS);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 100,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
        companionAddress: "bad",
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid companionAddress");
  });

  it("returns auth error when user auth fails on POST", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 100,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("creates order successfully", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 100,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
      },
      rawBody: JSON.stringify({
        user: "u1",
        item: "item1",
        amount: 100,
        userAddress: VALID_ADDRESS,
      }),
    });
    const req = createMockRequest("http://localhost/api/orders", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orderId).toBeDefined();
    expect(body.sent).toBe(true);
    expect(mocks.addOrder).toHaveBeenCalled();
    expect(mocks.trackOrderCreated).toHaveBeenCalled();
  });

  it("clears chain cache when chainDigest is provided", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 100,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
        chainDigest: "0xdigest",
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", {
      method: "POST",
      body: "{}",
    });
    await POST(req);
    expect(mocks.clearChainOrderCache).toHaveBeenCalled();
  });

  it("returns 500 when addOrder fails", async () => {
    mocks.addOrder.mockRejectedValue(new Error("db error"));
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 100,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("persist_failed");
  });

  it("returns 400 for invalid discount metadata", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 90,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
        meta: { firstOrderDiscount: { amount: NaN, minSpend: 50, originalTotal: 100 } },
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_discount");
  });

  it("returns 400 for discount amount mismatch", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 50,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
        meta: { firstOrderDiscount: { amount: 10, minSpend: 50, originalTotal: 100 } },
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("discount_mismatch");
  });

  it("returns 403 for first-order discount when user has existing orders", async () => {
    mocks.hasOrdersForAddress.mockResolvedValue(true);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 90,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
        meta: { firstOrderDiscount: { amount: 10, minSpend: 50, originalTotal: 100 } },
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("first_order_only");
  });

  it("publishes realtime event on success", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 100,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", {
      method: "POST",
      body: "{}",
    });
    await POST(req);
    expect(mocks.publishOrderEvent).toHaveBeenCalledWith(
      VALID_ADDRESS,
      expect.objectContaining({ type: "status_change", stage: "待处理" })
    );
  });

  it("returns 400 when discount originalTotal < minSpend", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 40,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
        meta: { firstOrderDiscount: { amount: 10, minSpend: 100, originalTotal: 50 } },
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", { method: "POST", body: "{}" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_discount");
  });

  it("sends webhook notification with mobile mention", async () => {
    mocks.env.E2E_SKIP_WEBHOOK = "";
    mocks.env.WECHAT_WEBHOOK_URL = "http://wecom.test/hook";
    mocks.getPlayerById.mockResolvedValue({ name: "Player1", contact: "13800138000" });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 100,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
        meta: { requestedPlayerId: "p1", requestedPlayerName: "Player1" },
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", { method: "POST", body: "{}" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // Wait for async webhook
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy).toHaveBeenCalled();
    fetchSpy.mockRestore();
    mocks.env.E2E_SKIP_WEBHOOK = "1";
    mocks.env.WECHAT_WEBHOOK_URL = "";
  });

  it("sends webhook notification with user mention (non-mobile contact)", async () => {
    mocks.env.E2E_SKIP_WEBHOOK = "";
    mocks.env.WECHAT_WEBHOOK_URL = "http://wecom.test/hook";
    mocks.getPlayerById.mockResolvedValue({ name: "Player1", contact: "wecom_user_id" });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 100,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
        meta: { requestedPlayerId: "p1", requestedPlayerName: "Player1" },
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", { method: "POST", body: "{}" });
    await POST(req);
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy).toHaveBeenCalled();
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(callBody.msgtype).toBe("text");
    expect(callBody.text.mentioned_list).toEqual(["wecom_user_id"]);
    fetchSpy.mockRestore();
    mocks.env.E2E_SKIP_WEBHOOK = "1";
    mocks.env.WECHAT_WEBHOOK_URL = "";
  });

  it("sends webhook with @all when player not found", async () => {
    mocks.env.E2E_SKIP_WEBHOOK = "";
    mocks.env.WECHAT_WEBHOOK_URL = "http://wecom.test/hook";
    mocks.getPlayerById.mockResolvedValue(null);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 100,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
        meta: { requestedPlayerId: "p1", requestedPlayerName: "Player1" },
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", { method: "POST", body: "{}" });
    await POST(req);
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy).toHaveBeenCalled();
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(callBody.text.mentioned_list).toEqual(["@all"]);
    fetchSpy.mockRestore();
    mocks.env.E2E_SKIP_WEBHOOK = "1";
    mocks.env.WECHAT_WEBHOOK_URL = "";
  });

  it("sends webhook with @all when player has empty contact", async () => {
    mocks.env.E2E_SKIP_WEBHOOK = "";
    mocks.env.WECHAT_WEBHOOK_URL = "http://wecom.test/hook";
    mocks.getPlayerById.mockResolvedValue({ name: "Player1", contact: "" });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 100,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
        meta: { requestedPlayerId: "p1", requestedPlayerName: "Player1" },
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", { method: "POST", body: "{}" });
    await POST(req);
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy).toHaveBeenCalled();
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(callBody.text.mentioned_list).toEqual(["@all"]);
    fetchSpy.mockRestore();
    mocks.env.E2E_SKIP_WEBHOOK = "1";
    mocks.env.WECHAT_WEBHOOK_URL = "";
  });

  it("handles webhook fetch failure gracefully", async () => {
    mocks.env.E2E_SKIP_WEBHOOK = "";
    mocks.env.WECHAT_WEBHOOK_URL = "http://wecom.test/hook";
    mocks.getPlayerById.mockResolvedValue(null);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 100,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
        meta: { requestedPlayerId: "p1" },
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", { method: "POST", body: "{}" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.trackWebhookFailed).toHaveBeenCalled();
    fetchSpy.mockRestore();
    mocks.env.E2E_SKIP_WEBHOOK = "1";
    mocks.env.WECHAT_WEBHOOK_URL = "";
  });

  it("handles webhook non-ok response", async () => {
    mocks.env.E2E_SKIP_WEBHOOK = "";
    mocks.env.WECHAT_WEBHOOK_URL = "http://wecom.test/hook";
    mocks.getPlayerById.mockResolvedValue(null);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("err", { status: 500 }));
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 100,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
        meta: { requestedPlayerId: "p1" },
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", { method: "POST", body: "{}" });
    await POST(req);
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.trackWebhookFailed).toHaveBeenCalled();
    fetchSpy.mockRestore();
    mocks.env.E2E_SKIP_WEBHOOK = "1";
    mocks.env.WECHAT_WEBHOOK_URL = "";
  });

  it("sends webhook with no mention when no requestedPlayerId", async () => {
    mocks.env.E2E_SKIP_WEBHOOK = "";
    mocks.env.WECHAT_WEBHOOK_URL = "http://wecom.test/hook";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 100,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", { method: "POST", body: "{}" });
    await POST(req);
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchSpy).toHaveBeenCalled();
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(callBody.text.mentioned_list).toEqual(["@all"]);
    fetchSpy.mockRestore();
    mocks.env.E2E_SKIP_WEBHOOK = "1";
    mocks.env.WECHAT_WEBHOOK_URL = "";
  });

  it("builds text with non-CNY currency", async () => {
    mocks.env.E2E_SKIP_WEBHOOK = "";
    mocks.env.WECHAT_WEBHOOK_URL = "http://wecom.test/hook";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 100,
        currency: "USD",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", { method: "POST", body: "{}" });
    await POST(req);
    await new Promise((r) => setTimeout(r, 50));
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(callBody.text.content).toContain("100 USD");
    fetchSpy.mockRestore();
    mocks.env.E2E_SKIP_WEBHOOK = "1";
    mocks.env.WECHAT_WEBHOOK_URL = "";
  });

  it("builds text with note and requestedPlayer with fallback reason missing_id", async () => {
    mocks.env.E2E_SKIP_WEBHOOK = "";
    mocks.env.WECHAT_WEBHOOK_URL = "http://wecom.test/hook";
    mocks.getPlayerById.mockResolvedValue(null);
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("ok", { status: 200 }));
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        user: "u1",
        item: "item1",
        amount: 100,
        currency: "CNY",
        status: "status.paid",
        userAddress: VALID_ADDRESS,
        note: "test note",
        meta: { requestedPlayerId: "p1", requestedPlayerName: "Player1" },
      },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/orders", { method: "POST", body: "{}" });
    await POST(req);
    await new Promise((r) => setTimeout(r, 50));
    const callBody = JSON.parse(fetchSpy.mock.calls[0][1]?.body as string);
    expect(callBody.text.content).toContain("备注：test note");
    expect(callBody.text.content).toContain("指定陪练：Player1");
    fetchSpy.mockRestore();
    mocks.env.E2E_SKIP_WEBHOOK = "1";
    mocks.env.WECHAT_WEBHOOK_URL = "";
  });

  it("returns cached public orders when etag does not match", async () => {
    mocks.getPlayerByAddress.mockResolvedValue({
      player: { status: "active" },
      conflict: false,
    });
    const cachedPayload = { items: [{ id: "ORD-C" }], nextCursor: null };
    mocks.getCacheAsync.mockResolvedValue({ etag: '"etag-cached"', value: cachedPayload });
    mocks.getIfNoneMatch.mockReturnValue('"different-etag"');
    const mockEtagRes = { status: 200, json: async () => cachedPayload };
    mocks.jsonWithEtag.mockReturnValue(mockEtagRes);
    const req = createMockRequest(`http://localhost/api/orders?public=1&address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mocks.jsonWithEtag).toHaveBeenCalledWith(
      cachedPayload,
      '"etag-cached"',
      expect.any(String)
    );
  });

  it("returns 400 for invalid cursor with valid JSON but wrong shape", async () => {
    mocks.getPlayerByAddress.mockResolvedValue({
      player: { status: "active" },
      conflict: false,
    });
    // Valid base64url JSON but missing required fields
    const badCursor = Buffer.from(JSON.stringify({ foo: "bar" }), "utf8").toString("base64url");
    const req = createMockRequest(
      `http://localhost/api/orders?public=1&address=${VALID_ADDRESS}&cursor=${badCursor}`
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_cursor");
  });

  it("returns public orders with nextCursor when available", async () => {
    mocks.getPlayerByAddress.mockResolvedValue({
      player: { status: "active", name: "Test" },
      conflict: false,
    });
    mocks.getCacheAsync.mockResolvedValue(null);
    const mockResult = {
      items: [
        {
          id: "ORD-1",
          user: "u1",
          item: "item1",
          amount: 100,
          currency: "CNY",
          stage: "待处理",
          createdAt: 1000,
          updatedAt: 2000,
        },
      ],
      nextCursor: { createdAt: 1000, id: "ORD-1" },
    };
    mocks.queryPublicOrdersCursor.mockResolvedValue(mockResult);
    const mockEtagRes = { status: 200, json: async () => ({}) };
    mocks.jsonWithEtag.mockReturnValue(mockEtagRes);
    const req = createMockRequest(`http://localhost/api/orders?public=1&address=${VALID_ADDRESS}`);
    await GET(req);
    expect(mocks.setCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ nextCursor: expect.any(String) }),
      expect.any(Number),
      expect.any(String)
    );
  });

  it("returns 403 when public pool player has conflict", async () => {
    mocks.getPlayerByAddress.mockResolvedValue({
      player: { status: "active" },
      conflict: true,
    });
    const req = createMockRequest(`http://localhost/api/orders?public=1&address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns auth error when public pool user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = createMockRequest(`http://localhost/api/orders?public=1&address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });
});
