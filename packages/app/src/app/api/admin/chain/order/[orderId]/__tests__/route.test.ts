import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockFindChainOrder, mockFindChainOrderDirect, mockGetOrderById } =
  vi.hoisted(() => ({
    mockRequireAdmin: vi.fn(),
    mockFindChainOrder: vi.fn(),
    mockFindChainOrderDirect: vi.fn(),
    mockGetOrderById: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/chain/chain-sync", () => ({
  findChainOrder: mockFindChainOrder,
  findChainOrderDirect: mockFindChainOrderDirect,
}));
vi.mock("@/lib/admin/admin-store", () => ({ getOrderById: mockGetOrderById }));

import { GET } from "../route";

const authOk = { ok: true, role: "viewer", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
const ctx = { params: Promise.resolve({ orderId: "123" }) };

function makeGet(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/chain/order/123");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("GET /api/admin/chain/order/[orderId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGet(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 when orderId is empty", async () => {
    const emptyCtx = { params: Promise.resolve({ orderId: "" }) };
    const res = await GET(makeGet(), emptyCtx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when both chain and local not found", async () => {
    mockFindChainOrder.mockResolvedValue(null);
    mockGetOrderById.mockResolvedValue(null);
    const res = await GET(makeGet(), ctx);
    expect(res.status).toBe(404);
  });

  it("returns chain order data", async () => {
    mockFindChainOrder.mockResolvedValue({
      orderId: "123",
      status: 1,
      user: "0x1",
      companion: "0x2",
    });
    mockGetOrderById.mockResolvedValue(null);
    const res = await GET(makeGet(), ctx);
    const json = await res.json();
    expect(json.orderId).toBe("123");
    expect(json.chainOrder).toBeTruthy();
  });

  it("uses direct query when direct=true", async () => {
    mockFindChainOrderDirect.mockResolvedValue({
      orderId: "123",
      status: 1,
      user: "0x1",
      companion: "0x2",
    });
    mockGetOrderById.mockResolvedValue(null);
    await GET(makeGet({ direct: "true" }), ctx);
    expect(mockFindChainOrderDirect).toHaveBeenCalledWith("123");
  });

  it("includes comparison when both exist", async () => {
    mockFindChainOrder.mockResolvedValue({
      orderId: "123",
      status: 2,
      user: "0x1",
      companion: "0x2",
    });
    mockGetOrderById.mockResolvedValue({
      id: "123",
      stage: "进行中",
      paymentStatus: "已支付",
      source: "chain",
      chainStatus: 2,
      userAddress: "0x1",
      companionAddress: "0x2",
      serviceFee: 10,
      deposit: 50,
      createdAt: 1000,
    });
    const res = await GET(makeGet(), ctx);
    const json = await res.json();
    expect(json.comparison).toBeTruthy();
    expect(json.comparison.statusMatch).toBe(true);
  });

  it("returns local order only when chain order not found", async () => {
    mockFindChainOrder.mockResolvedValue(null);
    mockGetOrderById.mockResolvedValue({
      id: "123",
      stage: "进行中",
      paymentStatus: "已支付",
      source: "app",
      chainStatus: null,
      userAddress: "0x1",
      companionAddress: null,
      serviceFee: null,
      deposit: null,
      createdAt: 1000,
    });
    const res = await GET(makeGet(), ctx);
    const json = await res.json();
    expect(json.localOrder).toBeTruthy();
    expect(json.chainOrder).toBeNull();
    expect(json.comparison).toBeNull();
  });

  it("shows needsSync when statuses differ", async () => {
    mockFindChainOrder.mockResolvedValue({
      orderId: "123",
      status: 3,
      user: "0x1",
      companion: "0x2",
    });
    mockGetOrderById.mockResolvedValue({
      id: "123",
      stage: "进行中",
      paymentStatus: "已支付",
      source: "chain",
      chainStatus: 1,
      userAddress: "0x1",
      companionAddress: "0x2",
      serviceFee: 10,
      deposit: 50,
      createdAt: 1000,
    });
    const res = await GET(makeGet(), ctx);
    const json = await res.json();
    expect(json.comparison.needsSync).toBe(true);
    expect(json.comparison.statusMatch).toBe(false);
  });

  it("handles local order with null optional fields", async () => {
    mockFindChainOrder.mockResolvedValue(null);
    mockGetOrderById.mockResolvedValue({
      id: "123",
      stage: "待支付",
      paymentStatus: "未支付",
      createdAt: 1000,
    });
    const res = await GET(makeGet(), ctx);
    const json = await res.json();
    expect(json.localOrder.source).toBeNull();
    expect(json.localOrder.chainStatus).toBeNull();
    expect(json.localOrder.userAddress).toBeNull();
    expect(json.localOrder.companionAddress).toBeNull();
    expect(json.localOrder.serviceFee).toBeNull();
    expect(json.localOrder.deposit).toBeNull();
  });

  it("handles comparison with null local chainStatus", async () => {
    mockFindChainOrder.mockResolvedValue({
      orderId: "123",
      status: 1,
      user: "0x1",
      companion: "0x2",
    });
    mockGetOrderById.mockResolvedValue({
      id: "123",
      stage: "进行中",
      paymentStatus: "已支付",
      userAddress: "0x1",
      companionAddress: "0x2",
      createdAt: 1000,
    });
    const res = await GET(makeGet(), ctx);
    const json = await res.json();
    expect(json.comparison.localChainStatus).toBeNull();
    expect(json.comparison.needsSync).toBe(true);
  });
});
