import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  requireUserAuth: vi.fn(),
  getOrderById: vi.fn(),
  getPlayerByAddress: vi.fn(),
  updateOrder: vi.fn(),
  updateOrderIfUnassigned: vi.fn(),
  processReferralReward: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
  canTransitionStage: vi.fn(),
  isChainOrder: vi.fn(),
  parseBodyRaw: vi.fn(),
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
vi.mock("@/lib/admin/admin-store", () => ({
  getOrderById: mocks.getOrderById,
  getPlayerByAddress: mocks.getPlayerByAddress,
  updateOrder: mocks.updateOrder,
  updateOrderIfUnassigned: mocks.updateOrderIfUnassigned,
  processReferralReward: mocks.processReferralReward,
}));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));
vi.mock("@/lib/order-guard", () => ({
  canTransitionStage: mocks.canTransitionStage,
  isChainOrder: mocks.isChainOrder,
}));
vi.mock("@/lib/shared/api-validation", () => ({
  parseBodyRaw: mocks.parseBodyRaw,
}));

import { GET, PATCH, DELETE } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);
const OTHER_ADDRESS = "0x" + "b".repeat(64);

const baseOrder = {
  id: "ORD-001",
  user: "test",
  userAddress: VALID_ADDRESS,
  companionAddress: OTHER_ADDRESS,
  item: "game",
  amount: 100,
  currency: "CNY",
  paymentStatus: "待支付",
  stage: "待处理" as const,
  displayStatus: "待处理",
  createdAt: Date.now(),
};

function makeCtx(orderId: string) {
  return { params: Promise.resolve({ orderId }) };
}

function makeReq(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("GET /api/orders/[orderId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
  });

  it("returns 404 when order not found", async () => {
    mocks.getOrderById.mockResolvedValue(null);
    const req = makeReq("http://localhost/api/orders/ORD-999");
    const res = await GET(req, makeCtx("ORD-999"));
    expect(res.status).toBe(404);
  });

  it("returns order for admin auth", async () => {
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    const req = makeReq("http://localhost/api/orders/ORD-001");
    const res = await GET(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("ORD-001");
  });

  it("returns order for user auth with userAddress query param", async () => {
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    const req = makeReq(`http://localhost/api/orders/ORD-001?userAddress=${VALID_ADDRESS}`);
    const res = await GET(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid userAddress", async () => {
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.isValidSuiAddress.mockReturnValue(false);
    const req = makeReq("http://localhost/api/orders/ORD-001?userAddress=bad");
    const res = await GET(req, makeCtx("ORD-001"));
    expect(res.status).toBe(400);
  });

  it("returns 403 when user is not order owner or companion", async () => {
    const thirdAddr = "0x" + "c".repeat(64);
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.normalizeSuiAddress.mockReturnValue(thirdAddr);
    const req = makeReq(`http://localhost/api/orders/ORD-001?userAddress=${thirdAddr}`);
    const res = await GET(req, makeCtx("ORD-001"));
    expect(res.status).toBe(403);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq(`http://localhost/api/orders/ORD-001?userAddress=${VALID_ADDRESS}`);
    const res = await GET(req, makeCtx("ORD-001"));
    expect(res.status).toBe(401);
  });

  it("falls back to admin auth when no userAddress param", async () => {
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq("http://localhost/api/orders/ORD-001");
    const res = await GET(req, makeCtx("ORD-001"));
    expect(res.status).toBe(401);
  });
});

describe("PATCH /api/orders/[orderId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
    mocks.canTransitionStage.mockReturnValue(true);
    mocks.isChainOrder.mockReturnValue(false);
  });

  it("returns 404 when order not found", async () => {
    mocks.getOrderById.mockResolvedValue(null);
    const req = makeReq("http://localhost/api/orders/ORD-999", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    mocks.parseBodyRaw.mockResolvedValue({ success: true, data: {}, rawBody: "{}" });
    const res = await PATCH(req, makeCtx("ORD-999"));
    expect(res.status).toBe(404);
  });

  it("returns validation error for invalid body", async () => {
    mocks.getOrderById.mockResolvedValue(baseOrder);
    const errResp = { status: 400, json: async () => ({ error: "Invalid JSON" }) };
    mocks.parseBodyRaw.mockResolvedValue({ success: false, response: errResp });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH", body: "bad" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(400);
  });

  it("admin can update order fields", async () => {
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { note: "updated" },
      rawBody: '{"note":"updated"}',
    });
    mocks.updateOrder.mockResolvedValue({ ...baseOrder, note: "updated" });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.note).toBe("updated");
  });

  it("rejects chain order stage change by admin", async () => {
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.isChainOrder.mockReturnValue(true);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { stage: "已完成" },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(409);
  });

  it("rejects invalid stage transition by admin", async () => {
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.canTransitionStage.mockReturnValue(false);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { stage: "已完成" },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(409);
  });

  it("returns 401 when non-admin has no userAddress", async () => {
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.parseBodyRaw.mockResolvedValue({ success: true, data: {}, rawBody: "{}" });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(401);
  });

  it("user can update own order with userAddress", async () => {
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: VALID_ADDRESS, meta: {} },
      rawBody: "{}",
    });
    mocks.updateOrder.mockResolvedValue({ ...baseOrder, meta: {} });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
  });

  it("returns 409 when updateOrderIfUnassigned returns null for companion", async () => {
    mocks.getOrderById.mockResolvedValue({ ...baseOrder, companionAddress: undefined });
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.getPlayerByAddress.mockResolvedValue({ player: { status: "active" }, conflict: false });
    mocks.updateOrderIfUnassigned.mockResolvedValue(null);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { companionAddress: OTHER_ADDRESS, userAddress: OTHER_ADDRESS, meta: {} },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("order already accepted");
  });

  it("returns 404 when updateOrder returns null for non-companion user", async () => {
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.updateOrder.mockResolvedValue(null);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: VALID_ADDRESS, meta: {} },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not found");
  });

  it("returns 404 when admin updateOrder returns null", async () => {
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.updateOrder.mockResolvedValue(null);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { note: "updated" },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(404);
  });

  it("rejects chain order stage change by non-admin user via status", async () => {
    mocks.getOrderById.mockResolvedValue({ ...baseOrder, companionAddress: undefined });
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.isChainOrder.mockReturnValue(true);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: VALID_ADDRESS, status: "已完成", meta: {} },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(409);
  });

  it("rejects invalid stage transition for non-admin user", async () => {
    mocks.getOrderById.mockResolvedValue({ ...baseOrder, companionAddress: undefined });
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.canTransitionStage.mockReturnValue(false);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: VALID_ADDRESS, status: "已取消", meta: {} },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(409);
  });

  it("companion who is already assignee uses updateOrder", async () => {
    const orderWithCompanion = { ...baseOrder, companionAddress: OTHER_ADDRESS };
    mocks.getOrderById.mockResolvedValue(orderWithCompanion);
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.getPlayerByAddress.mockResolvedValue({ player: { status: "active" }, conflict: false });
    mocks.updateOrder.mockResolvedValue({ ...orderWithCompanion, meta: { status: "进行中" } });
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        companionAddress: OTHER_ADDRESS,
        userAddress: OTHER_ADDRESS,
        status: "进行中",
        meta: {},
      },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
    expect(mocks.updateOrder).toHaveBeenCalled();
    expect(mocks.updateOrderIfUnassigned).not.toHaveBeenCalled();
  });

  it("triggers referral reward when stage transitions to 已完成", async () => {
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.updateOrder.mockResolvedValue({ ...baseOrder, stage: "已完成" });
    mocks.processReferralReward.mockResolvedValue(undefined);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { stage: "已完成" },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    await PATCH(req, makeCtx("ORD-001"));
    expect(mocks.processReferralReward).toHaveBeenCalledWith("ORD-001", VALID_ADDRESS, 100);
  });

  it("does not trigger referral reward when already 已完成", async () => {
    const completedOrder = { ...baseOrder, stage: "已完成" as const };
    mocks.getOrderById.mockResolvedValue(completedOrder);
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.updateOrder.mockResolvedValue(completedOrder);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { note: "updated" },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    await PATCH(req, makeCtx("ORD-001"));
    expect(mocks.processReferralReward).not.toHaveBeenCalled();
  });

  it("admin can update all supported fields", async () => {
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    const updatedOrder = {
      ...baseOrder,
      paymentStatus: "已支付",
      note: "note",
      assignedTo: "player1",
      stage: "已确认",
      user: "newuser",
      userAddress: VALID_ADDRESS,
      companionAddress: OTHER_ADDRESS,
      chainDigest: "0xdigest",
      chainStatus: 2,
      serviceFee: 10,
      deposit: 50,
      meta: { key: "val" },
    };
    mocks.updateOrder.mockResolvedValue(updatedOrder);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {
        paymentStatus: "已支付",
        note: "note",
        assignedTo: "player1",
        stage: "已确认",
        user: "newuser",
        userAddress: VALID_ADDRESS,
        companionAddress: OTHER_ADDRESS,
        chainDigest: "0xdigest",
        chainStatus: 2,
        serviceFee: 10,
        deposit: 50,
        meta: { key: "val" },
      },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
    expect(mocks.updateOrder).toHaveBeenCalledWith(
      "ORD-001",
      expect.objectContaining({
        paymentStatus: "已支付",
        note: "note",
        assignedTo: "player1",
        stage: "已确认",
      })
    );
  });

  it("returns 400 for invalid companion address", async () => {
    mocks.getOrderById.mockResolvedValue({ ...baseOrder, companionAddress: undefined });
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.isValidSuiAddress.mockImplementation((a: string) => a === VALID_ADDRESS);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { companionAddress: "bad", userAddress: "bad", meta: {} },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(400);
  });

  it("returns 403 when companion tries to accept own order", async () => {
    mocks.getOrderById.mockResolvedValue({ ...baseOrder, companionAddress: undefined });
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { companionAddress: VALID_ADDRESS, userAddress: VALID_ADDRESS, meta: {} },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("cannot accept own order");
  });

  it("returns 400 when companion address does not match actor", async () => {
    const thirdAddr = "0x" + "c".repeat(64);
    mocks.getOrderById.mockResolvedValue({ ...baseOrder, companionAddress: undefined });
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { companionAddress: OTHER_ADDRESS, userAddress: thirdAddr, meta: {} },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("companionAddress must match userAddress");
  });

  it("returns 409 when order already accepted by different companion", async () => {
    const thirdAddr = "0x" + "c".repeat(64);
    mocks.getOrderById.mockResolvedValue({ ...baseOrder, companionAddress: thirdAddr });
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { companionAddress: OTHER_ADDRESS, userAddress: OTHER_ADDRESS, meta: {} },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("order already accepted");
  });

  it("returns 403 when non-owner non-companion tries to update", async () => {
    const thirdAddr = "0x" + "c".repeat(64);
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: thirdAddr, meta: {} },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("forbidden");
  });

  it("returns auth error when user auth fails for PATCH", async () => {
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: VALID_ADDRESS, meta: {} },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(401);
  });

  it("returns 403 when companion is not a valid player", async () => {
    mocks.getOrderById.mockResolvedValue({ ...baseOrder, companionAddress: undefined });
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.getPlayerByAddress.mockResolvedValue({ player: null, conflict: false });
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { companionAddress: OTHER_ADDRESS, userAddress: OTHER_ADDRESS, meta: {} },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("player_required");
  });

  it("maps status to stage for non-chain order", async () => {
    mocks.getOrderById.mockResolvedValue({ ...baseOrder, companionAddress: undefined });
    mocks.requireAdmin.mockResolvedValue({ ok: false, response: { status: 401 } });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.updateOrder.mockResolvedValue({
      ...baseOrder,
      stage: "已取消",
      meta: { status: "已取消" },
    });
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { userAddress: VALID_ADDRESS, status: "已取消", meta: {} },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "PATCH" });
    const res = await PATCH(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/orders/[orderId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isChainOrder.mockReturnValue(false);
  });

  it("returns 401 when admin auth fails", async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "DELETE" });
    const res = await DELETE(req, makeCtx("ORD-001"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when order not found", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.getOrderById.mockResolvedValue(null);
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "DELETE" });
    const res = await DELETE(req, makeCtx("ORD-001"));
    expect(res.status).toBe(404);
  });

  it("cancels non-chain order successfully", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.updateOrder.mockResolvedValue({ ...baseOrder, stage: "已取消" });
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "DELETE" });
    const res = await DELETE(req, makeCtx("ORD-001"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 409 when trying to delete chain order", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.isChainOrder.mockReturnValue(true);
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "DELETE" });
    const res = await DELETE(req, makeCtx("ORD-001"));
    expect(res.status).toBe(409);
  });

  it("returns 404 when updateOrder returns null on delete", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true });
    mocks.getOrderById.mockResolvedValue(baseOrder);
    mocks.updateOrder.mockResolvedValue(null);
    const req = makeReq("http://localhost/api/orders/ORD-001", { method: "DELETE" });
    const res = await DELETE(req, makeCtx("ORD-001"));
    expect(res.status).toBe(404);
  });
});
