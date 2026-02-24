import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockRemoveOrders, mockRecordAudit } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockRemoveOrders: vi.fn(),
  mockRecordAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({ removeOrders: mockRemoveOrders }));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));

import { POST } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makePost(body: unknown) {
  return new Request("http://localhost/api/admin/orders/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("POST /api/admin/orders/bulk-delete", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePost({ ids: ["1"] }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(makePost({ ids: [] }));
    expect(res.status).toBe(400);
  });

  it("deletes orders and returns count", async () => {
    mockRemoveOrders.mockResolvedValue(2);
    const res = await POST(makePost({ ids: ["o1", "o2"] }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.count).toBe(2);
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("returns 400 when ids is missing", async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when ids contains empty strings", async () => {
    const res = await POST(makePost({ ids: [""] }));
    expect(res.status).toBe(400);
  });

  it("calls removeOrders with correct ids", async () => {
    mockRemoveOrders.mockResolvedValue(3);
    const res = await POST(makePost({ ids: ["a", "b", "c"] }));
    const json = await res.json();
    expect(json.count).toBe(3);
    expect(mockRemoveOrders).toHaveBeenCalledWith(["a", "b", "c"]);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ ok: true }),
      "orders.bulk_delete",
      "order",
      "a,b,c",
      expect.objectContaining({ count: 3, ids: ["a", "b", "c"] })
    );
  });
});
