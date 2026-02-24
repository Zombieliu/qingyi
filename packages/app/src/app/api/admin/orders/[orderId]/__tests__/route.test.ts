import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockGetOrderById,
  mockUpdateOrder,
  mockListPlayers,
  mockRecordAudit,
  mockIsChainOrder,
  mockCanTransitionStage,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetOrderById: vi.fn(),
  mockUpdateOrder: vi.fn(),
  mockListPlayers: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockIsChainOrder: vi.fn(),
  mockCanTransitionStage: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/admin/admin-store", () => ({
  getOrderById: mockGetOrderById,
  updateOrder: mockUpdateOrder,
  listPlayers: mockListPlayers,
}));

vi.mock("@/lib/admin/admin-audit", () => ({
  recordAudit: mockRecordAudit,
}));

vi.mock("@/lib/order-guard", () => ({
  isChainOrder: mockIsChainOrder,
  canTransitionStage: mockCanTransitionStage,
}));

import { GET, PATCH } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = {
  ok: false,
  response: Response.json({ error: "Unauthorized" }, { status: 401 }),
};
const routeCtx = (orderId: string) => ({
  params: Promise.resolve({ orderId }),
});

const sampleOrder = {
  id: "ORD-1",
  user: "u1",
  item: "sword",
  amount: 100,
  stage: "待处理" as const,
  paymentStatus: "已支付",
  assignedTo: undefined,
};

function makePatchRequest(body: unknown) {
  return new Request("http://localhost/api/admin/orders/ORD-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGetRequest(orderId = "ORD-1") {
  return new Request(`http://localhost/api/admin/orders/${orderId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockIsChainOrder.mockReturnValue(false);
  mockCanTransitionStage.mockReturnValue(true);
});

// ─── GET ───────────────────────────────────────────────

describe("GET /api/admin/orders/[orderId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGetRequest(), routeCtx("ORD-1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when orderId is empty", async () => {
    const res = await GET(makeGetRequest(""), routeCtx(""));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Missing orderId");
  });

  it("returns 404 when order not found", async () => {
    mockGetOrderById.mockResolvedValue(null);
    const res = await GET(makeGetRequest(), routeCtx("ORD-999"));
    expect(res.status).toBe(404);
  });
  it("returns order on success", async () => {
    mockGetOrderById.mockResolvedValue(sampleOrder);
    const res = await GET(makeGetRequest(), routeCtx("ORD-1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.id).toBe("ORD-1");
  });
});

// ─── PATCH ─────────────────────────────────────────────

describe("PATCH /api/admin/orders/[orderId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await PATCH(makePatchRequest({ note: "hi" }), routeCtx("ORD-1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when orderId is empty", async () => {
    const res = await PATCH(makePatchRequest({ note: "hi" }), routeCtx(""));
    expect(res.status).toBe(400);
  });

  it("returns 404 when order not found", async () => {
    mockGetOrderById.mockResolvedValue(null);
    const res = await PATCH(makePatchRequest({ note: "hi" }), routeCtx("ORD-999"));
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid JSON body", async () => {
    mockGetOrderById.mockResolvedValue(sampleOrder);
    const req = new Request("http://localhost/api/admin/orders/ORD-1", {
      method: "PATCH",
      body: "not-json",
    });
    const res = await PATCH(req, routeCtx("ORD-1"));
    expect(res.status).toBe(400);
  });

  it("returns 409 when modifying chain order stage", async () => {
    mockGetOrderById.mockResolvedValue({ ...sampleOrder, chainDigest: "0xabc" });
    mockIsChainOrder.mockReturnValue(true);
    const res = await PATCH(makePatchRequest({ stage: "已确认" }), routeCtx("ORD-1"));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("禁止手动修改");
  });

  it("returns 409 when stage transition is invalid", async () => {
    mockGetOrderById.mockResolvedValue(sampleOrder);
    mockCanTransitionStage.mockReturnValue(false);
    const res = await PATCH(makePatchRequest({ stage: "已退款" }), routeCtx("ORD-1"));
    expect(res.status).toBe(409);
  });

  it("updates order note successfully", async () => {
    mockGetOrderById.mockResolvedValue(sampleOrder);
    mockUpdateOrder.mockResolvedValue({ ...sampleOrder, note: "updated" });
    const res = await PATCH(makePatchRequest({ note: "updated" }), routeCtx("ORD-1"));
    expect(res.status).toBe(200);
    expect(mockUpdateOrder).toHaveBeenCalledWith(
      "ORD-1",
      expect.objectContaining({ note: "updated" })
    );
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("returns 400 when assigned player is not available", async () => {
    mockGetOrderById.mockResolvedValue(sampleOrder);
    mockListPlayers.mockResolvedValue([{ id: "p1", name: "Player1", status: "休息中" }]);
    const res = await PATCH(makePatchRequest({ assignedTo: "p1" }), routeCtx("ORD-1"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("不可接单");
  });

  it("returns 400 when player deposit is insufficient", async () => {
    mockGetOrderById.mockResolvedValue(sampleOrder);
    mockListPlayers.mockResolvedValue([
      { id: "p1", name: "Player1", status: "可接单", depositBase: 1000, depositLocked: 500 },
    ]);
    const res = await PATCH(makePatchRequest({ assignedTo: "p1" }), routeCtx("ORD-1"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("押金不足");
  });

  it("returns 400 when player credit is insufficient", async () => {
    mockGetOrderById.mockResolvedValue({ ...sampleOrder, amount: 500 });
    mockListPlayers.mockResolvedValue([
      { id: "p1", name: "Player1", status: "可接单", depositBase: 0, availableCredit: 100 },
    ]);
    const res = await PATCH(makePatchRequest({ assignedTo: "p1" }), routeCtx("ORD-1"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("授信额度不足");
  });

  it("assigns player and sets companion address and meta driver", async () => {
    mockGetOrderById.mockResolvedValue({ ...sampleOrder, companionAddress: undefined });
    mockListPlayers.mockResolvedValue([
      {
        id: "p1",
        name: "Player1",
        status: "可接单",
        depositBase: 0,
        availableCredit: 1000,
        address: "0xplayer",
        role: "辅助",
      },
    ]);
    mockUpdateOrder.mockResolvedValue({ ...sampleOrder, assignedTo: "p1" });
    const res = await PATCH(makePatchRequest({ assignedTo: "p1" }), routeCtx("ORD-1"));
    expect(res.status).toBe(200);
    expect(mockUpdateOrder).toHaveBeenCalledWith(
      "ORD-1",
      expect.objectContaining({
        assignedTo: "p1",
        companionAddress: "0xplayer",
        meta: expect.objectContaining({
          driver: expect.objectContaining({ name: "Player1", tier: "辅助" }),
        }),
      })
    );
  });

  it("clears driver meta when assignedTo is set to empty string", async () => {
    mockGetOrderById.mockResolvedValue({ ...sampleOrder, assignedTo: "p1" });
    mockUpdateOrder.mockResolvedValue({ ...sampleOrder, assignedTo: "" });
    const res = await PATCH(makePatchRequest({ assignedTo: "" }), routeCtx("ORD-1"));
    expect(res.status).toBe(200);
    expect(mockUpdateOrder).toHaveBeenCalledWith(
      "ORD-1",
      expect.objectContaining({
        meta: expect.objectContaining({ driver: null }),
      })
    );
  });

  it("returns 404 when updateOrder returns null", async () => {
    mockGetOrderById.mockResolvedValue(sampleOrder);
    mockUpdateOrder.mockResolvedValue(null);
    const res = await PATCH(makePatchRequest({ note: "test" }), routeCtx("ORD-1"));
    expect(res.status).toBe(404);
  });

  it("assigns player without role sets car to '已接单'", async () => {
    mockGetOrderById.mockResolvedValue({ ...sampleOrder, companionAddress: "0xexisting" });
    mockListPlayers.mockResolvedValue([
      {
        id: "p1",
        name: "Player1",
        status: "可接单",
        depositBase: 0,
        availableCredit: 1000,
        address: "0xplayer",
      },
    ]);
    mockUpdateOrder.mockResolvedValue({ ...sampleOrder, assignedTo: "p1" });
    const res = await PATCH(makePatchRequest({ assignedTo: "p1" }), routeCtx("ORD-1"));
    expect(res.status).toBe(200);
    expect(mockUpdateOrder).toHaveBeenCalledWith(
      "ORD-1",
      expect.objectContaining({
        meta: expect.objectContaining({
          driver: expect.objectContaining({ car: "已接单" }),
        }),
      })
    );
    // Should NOT set companionAddress since current order already has one
    const callArgs = mockUpdateOrder.mock.calls[0][1];
    expect(callArgs.companionAddress).toBeUndefined();
  });
});
