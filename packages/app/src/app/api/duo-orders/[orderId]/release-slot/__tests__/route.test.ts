import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getDuoOrderById: vi.fn(),
  releaseDuoSlot: vi.fn(),
  updateDuoOrder: vi.fn(),
  requireUserAuth: vi.fn(),
  requireAdmin: vi.fn(),
  parseBodyRaw: vi.fn(),
  publishOrderEvent: vi.fn(),
  adminReleaseDuoSlot: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
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

vi.mock("@/lib/admin/duo-order-store", () => ({
  getDuoOrderById: mocks.getDuoOrderById,
  releaseDuoSlot: mocks.releaseDuoSlot,
  updateDuoOrder: mocks.updateDuoOrder,
}));
vi.mock("@/lib/auth/user-auth", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/shared/api-validation", () => ({ parseBodyRaw: mocks.parseBodyRaw }));
vi.mock("@/lib/realtime", () => ({ publishOrderEvent: mocks.publishOrderEvent }));
vi.mock("@/lib/chain/duo-chain-admin", () => ({
  adminReleaseDuoSlot: mocks.adminReleaseDuoSlot,
}));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));

import { POST } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);
const COMPANION_A = "0x" + "b".repeat(64);
const COMPANION_B = "0x" + "c".repeat(64);

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "duo-1",
    userAddress: VALID_ADDRESS,
    companionAddressA: COMPANION_A,
    companionAddressB: COMPANION_B,
    chainStatus: 1,
    stage: "已确认",
    ...overrides,
  };
}

function createMockRequest(url: string, options?: RequestInit) {
  return new Request(url, options);
}

const routeContext = { params: Promise.resolve({ orderId: "duo-1" }) };

describe("POST /api/duo-orders/[orderId]/release-slot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: COMPANION_A });
    mocks.publishOrderEvent.mockResolvedValue(undefined);
  });

  it("returns 404 when order not found", async () => {
    mocks.getDuoOrderById.mockResolvedValue(null);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { companionAddress: COMPANION_A },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/duo-orders/duo-1/release-slot", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid companionAddress", async () => {
    mocks.getDuoOrderById.mockResolvedValue(makeOrder());
    mocks.isValidSuiAddress.mockReturnValue(false);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { companionAddress: "bad" },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/duo-orders/duo-1/release-slot", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(400);
  });

  it("returns 400 when companion not in any slot", async () => {
    const otherAddr = "0x" + "d".repeat(64);
    mocks.getDuoOrderById.mockResolvedValue(makeOrder());
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { companionAddress: otherAddr },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/duo-orders/duo-1/release-slot", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(400);
  });

  it("returns 409 when order already completed (chainStatus >= 3)", async () => {
    mocks.getDuoOrderById.mockResolvedValue(makeOrder({ chainStatus: 3 }));
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { companionAddress: COMPANION_A },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/duo-orders/duo-1/release-slot", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(409);
  });

  it("companion self-release succeeds", async () => {
    const order = makeOrder();
    mocks.getDuoOrderById.mockResolvedValue(order);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { companionAddress: COMPANION_A, chainDigest: "0xRELEASE_A" },
      rawBody: JSON.stringify({ companionAddress: COMPANION_A, chainDigest: "0xRELEASE_A" }),
    });
    const updated = { ...order, companionAddressA: null, stage: "已确认" };
    mocks.releaseDuoSlot.mockResolvedValue(updated);

    const req = createMockRequest("http://localhost/api/duo-orders/duo-1/release-slot", {
      method: "POST",
      body: JSON.stringify({ companionAddress: COMPANION_A, chainDigest: "0xRELEASE_A" }),
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(200);
    expect(mocks.releaseDuoSlot).toHaveBeenCalledWith("duo-1", "A");
    expect(mocks.publishOrderEvent).toHaveBeenCalled();
  });

  it("companion self-release for slot B", async () => {
    const order = makeOrder();
    mocks.getDuoOrderById.mockResolvedValue(order);
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: COMPANION_B });
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { companionAddress: COMPANION_B, chainDigest: "0xRELEASE_B" },
      rawBody: JSON.stringify({ companionAddress: COMPANION_B, chainDigest: "0xRELEASE_B" }),
    });
    const updated = { ...order, companionAddressB: null, stage: "已确认" };
    mocks.releaseDuoSlot.mockResolvedValue(updated);

    const req = createMockRequest("http://localhost/api/duo-orders/duo-1/release-slot", {
      method: "POST",
      body: JSON.stringify({ companionAddress: COMPANION_B, chainDigest: "0xRELEASE_B" }),
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(200);
    expect(mocks.releaseDuoSlot).toHaveBeenCalledWith("duo-1", "B");
  });

  it("admin release with chain call succeeds", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, role: "admin" });
    const order = makeOrder();
    mocks.getDuoOrderById.mockResolvedValue(order);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { companionAddress: COMPANION_A },
      rawBody: "{}",
    });
    mocks.adminReleaseDuoSlot.mockResolvedValue({ digest: "0xDIGEST" });
    const updated = { ...order, companionAddressA: null, stage: "已确认" };
    mocks.releaseDuoSlot.mockResolvedValue(updated);

    const req = createMockRequest("http://localhost/api/duo-orders/duo-1/release-slot", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(200);
    expect(mocks.adminReleaseDuoSlot).toHaveBeenCalledWith({
      orderId: "duo-1",
      slot: 0,
      newCompanion: undefined,
    });
  });

  it("admin release with replacement companion", async () => {
    const newComp = "0x" + "e".repeat(64);
    mocks.requireAdmin.mockResolvedValue({ ok: true, role: "admin" });
    const order = makeOrder();
    mocks.getDuoOrderById.mockResolvedValue(order);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { companionAddress: COMPANION_B, newCompanion: newComp },
      rawBody: "{}",
    });
    mocks.adminReleaseDuoSlot.mockResolvedValue({ digest: "0xDIGEST" });
    const updated = { ...order, companionAddressB: null, stage: "已确认" };
    mocks.releaseDuoSlot.mockResolvedValue(updated);
    mocks.updateDuoOrder.mockResolvedValue({ ...order, companionAddressB: newComp });

    const req = createMockRequest("http://localhost/api/duo-orders/duo-1/release-slot", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(200);
    expect(mocks.updateDuoOrder).toHaveBeenCalledWith("duo-1", { companionAddressB: newComp });
  });

  it("admin release returns 502 when chain call fails", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, role: "admin" });
    mocks.getDuoOrderById.mockResolvedValue(makeOrder());
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { companionAddress: COMPANION_A },
      rawBody: "{}",
    });
    mocks.adminReleaseDuoSlot.mockRejectedValue(new Error("chain timeout"));

    const req = createMockRequest("http://localhost/api/duo-orders/duo-1/release-slot", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(502);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.getDuoOrderById.mockResolvedValue(makeOrder());
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { companionAddress: COMPANION_A },
      rawBody: "{}",
    });
    const req = createMockRequest("http://localhost/api/duo-orders/duo-1/release-slot", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req, routeContext);
    expect(res.status).toBe(401);
  });
});
