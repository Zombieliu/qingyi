import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockAddOrder,
  mockQueryOrders,
  mockQueryOrdersCursor,
  mockRecordAudit,
  mockDecodeCursorParam,
  mockEncodeCursorParam,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockAddOrder: vi.fn(),
  mockQueryOrders: vi.fn(),
  mockQueryOrdersCursor: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockDecodeCursorParam: vi.fn(),
  mockEncodeCursorParam: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/admin/admin-store", () => ({
  addOrder: mockAddOrder,
  queryOrders: mockQueryOrders,
  queryOrdersCursor: mockQueryOrdersCursor,
}));

vi.mock("@/lib/admin/admin-audit", () => ({
  recordAudit: mockRecordAudit,
}));

vi.mock("@/lib/cursor-utils", () => ({
  decodeCursorParam: mockDecodeCursorParam,
  encodeCursorParam: mockEncodeCursorParam,
}));

import { GET, POST } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = {
  ok: false,
  response: Response.json({ error: "Unauthorized" }, { status: 401 }),
};

function makeGetRequest(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/orders");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/admin/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockDecodeCursorParam.mockReturnValue(null);
  mockEncodeCursorParam.mockReturnValue(null);
});

// ─── GET ───────────────────────────────────────────────

describe("GET /api/admin/orders", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it("uses cursor-based pagination by default", async () => {
    mockQueryOrdersCursor.mockResolvedValue({ items: [{ id: "o1" }], nextCursor: null });
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(mockQueryOrdersCursor).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 20, cursor: undefined })
    );
    expect(json.items).toEqual([{ id: "o1" }]);
  });

  it("uses offset pagination when page param is present and no cursor", async () => {
    mockQueryOrders.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "2", pageSize: "10" }));
    expect(mockQueryOrders).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, pageSize: 10 })
    );
  });

  it("clamps pageSize between 5 and 200", async () => {
    mockQueryOrders.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "1", pageSize: "1" }));
    expect(mockQueryOrders).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 5 }));

    mockQueryOrders.mockClear();
    await GET(makeGetRequest({ page: "1", pageSize: "999" }));
    expect(mockQueryOrders).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 200 }));
  });
  it("passes stage, q, paymentStatus, assignedTo filters", async () => {
    mockQueryOrdersCursor.mockResolvedValue({ items: [], nextCursor: null });
    await GET(
      makeGetRequest({ stage: "待处理", q: "test", paymentStatus: "已支付", assignedTo: "p1" })
    );
    expect(mockQueryOrdersCursor).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "待处理",
        q: "test",
        paymentStatus: "已支付",
        assignedTo: "p1",
      })
    );
  });

  it("forwards decoded cursor to queryOrdersCursor", async () => {
    const cursor = { createdAt: 1000, id: "abc" };
    mockDecodeCursorParam.mockReturnValue(cursor);
    mockQueryOrdersCursor.mockResolvedValue({ items: [], nextCursor: null });
    await GET(makeGetRequest({ cursor: "encoded" }));
    expect(mockQueryOrdersCursor).toHaveBeenCalledWith(expect.objectContaining({ cursor }));
  });

  it("encodes nextCursor in response", async () => {
    mockQueryOrdersCursor.mockResolvedValue({
      items: [],
      nextCursor: { createdAt: 2000, id: "xyz" },
    });
    mockEncodeCursorParam.mockReturnValue("encoded-next");
    const res = await GET(makeGetRequest());
    const json = await res.json();
    expect(json.nextCursor).toBe("encoded-next");
  });

  it("ensures page is at least 1", async () => {
    mockQueryOrders.mockResolvedValue({ items: [], total: 0 });
    await GET(makeGetRequest({ page: "-5" }));
    expect(mockQueryOrders).toHaveBeenCalledWith(expect.objectContaining({ page: 1 }));
  });
});

// ─── POST ──────────────────────────────────────────────

describe("POST /api/admin/orders", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePostRequest({ user: "u1", item: "i1", amount: 100 }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/admin/orders", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makePostRequest({ amount: 100 }));
    expect(res.status).toBe(400);
  });
  it("creates order with defaults and returns 201", async () => {
    mockAddOrder.mockResolvedValue(undefined);
    const res = await POST(makePostRequest({ user: "u1", item: "sword", amount: 50 }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.user).toBe("u1");
    expect(json.item).toBe("sword");
    expect(json.amount).toBe(50);
    expect(json.currency).toBe("CNY");
    expect(json.paymentStatus).toBe("已支付");
    expect(json.stage).toBe("待处理");
    expect(json.source).toBe("manual");
    expect(json.id).toMatch(/^ORD-/);
  });

  it("uses provided id when given", async () => {
    mockAddOrder.mockResolvedValue(undefined);
    const res = await POST(makePostRequest({ id: "MY-ORDER", user: "u1", item: "i1", amount: 10 }));
    const json = await res.json();
    expect(json.id).toBe("MY-ORDER");
  });

  it("calls addOrder and recordAudit", async () => {
    mockAddOrder.mockResolvedValue(undefined);
    await POST(makePostRequest({ user: "u1", item: "i1", amount: 10 }));
    expect(mockAddOrder).toHaveBeenCalledTimes(1);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.anything(),
      authOk,
      "orders.create",
      "order",
      expect.stringMatching(/^ORD-/),
      expect.objectContaining({ amount: 10, source: "manual" })
    );
  });

  it("returns 400 when amount is not a number", async () => {
    const res = await POST(makePostRequest({ user: "u1", item: "i1", amount: "not-a-number" }));
    expect(res.status).toBe(400);
  });

  it("sets displayStatus from paymentStatus", async () => {
    mockAddOrder.mockResolvedValue(undefined);
    const res = await POST(
      makePostRequest({ user: "u1", item: "i1", amount: 10, paymentStatus: "待支付" })
    );
    const json = await res.json();
    expect(json.displayStatus).toBe("待支付");
  });
});
