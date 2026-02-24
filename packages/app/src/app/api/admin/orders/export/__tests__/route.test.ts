import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockQueryOrders } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockQueryOrders: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({ queryOrders: mockQueryOrders }));

import { GET } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makeGet(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/orders/export");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("GET /api/admin/orders/export", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("returns CSV by default", async () => {
    mockQueryOrders.mockResolvedValue({
      items: [
        {
          id: "o1",
          user: "u1",
          item: "i1",
          amount: 10,
          currency: "CNY",
          paymentStatus: "已支付",
          stage: "已完成",
          note: "",
          assignedTo: "",
          source: "manual",
          createdAt: Date.now(),
          updatedAt: null,
        },
      ],
    });
    const res = await GET(makeGet());
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const text = await res.text();
    expect(text).toContain("id,user,item");
  });

  it("returns JSON when format=json", async () => {
    mockQueryOrders.mockResolvedValue({ items: [{ id: "o1" }] });
    const res = await GET(makeGet({ format: "json" }));
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
  });

  it("passes filter params", async () => {
    mockQueryOrders.mockResolvedValue({ items: [] });
    await GET(makeGet({ stage: "已完成", q: "test" }));
    expect(mockQueryOrders).toHaveBeenCalledWith(
      expect.objectContaining({ stage: "已完成", q: "test" })
    );
  });
});
