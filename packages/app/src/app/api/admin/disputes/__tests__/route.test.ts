import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockResolveDispute, mockListAdminDisputes, mockCloseDisputeTicket } =
  vi.hoisted(() => ({
    mockRequireAdmin: vi.fn(),
    mockResolveDispute: vi.fn(),
    mockListAdminDisputes: vi.fn(),
    mockCloseDisputeTicket: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/services/dispute-service", () => ({
  resolveDispute: mockResolveDispute,
  listAdminDisputes: mockListAdminDisputes,
}));
vi.mock("@/lib/services/dispute-ticket-service", () => ({
  closeDisputeTicket: mockCloseDisputeTicket,
}));

import { GET, POST } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makePost(body: unknown) {
  return new Request("http://localhost/api/admin/disputes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("POST /api/admin/disputes", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePost({ orderId: "1", resolution: "refund" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid body", async () => {
    const res = await POST(makePost({}));
    expect(res.status).toBe(400);
  });

  it("resolves dispute successfully", async () => {
    mockResolveDispute.mockResolvedValue({ id: "d1", status: "resolved" });
    mockCloseDisputeTicket.mockResolvedValue(undefined);
    const res = await POST(makePost({ orderId: "1", resolution: "refund" }));
    const json = await res.json();
    expect(json.id).toBe("d1");
    expect(mockCloseDisputeTicket).toHaveBeenCalledWith("1", {
      resolution: "refund",
    });
  });

  it("returns 400 on dispute error", async () => {
    mockResolveDispute.mockRejectedValue(new Error("not found"));
    const res = await POST(makePost({ orderId: "1", resolution: "reject" }));
    expect(res.status).toBe(400);
  });

  it("handles non-Error thrown from resolveDispute", async () => {
    mockResolveDispute.mockRejectedValue("string error");
    const res = await POST(makePost({ orderId: "1", resolution: "reject" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("处理争议失败");
  });
});

describe("GET /api/admin/disputes", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(new Request("http://localhost/api/admin/disputes"));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid query", async () => {
    const res = await GET(new Request("http://localhost/api/admin/disputes?limit=9999"));
    expect(res.status).toBe(400);
  });

  it("returns disputes list", async () => {
    mockListAdminDisputes.mockResolvedValue([
      {
        order: { id: "ORD-1", item: "test", amount: 10, stage: "争议中", userAddress: "0xuser" },
        dispute: { id: "DSP-1", orderId: "ORD-1", status: "pending" },
        source: "table",
      },
    ]);
    const res = await GET(new Request("http://localhost/api/admin/disputes?limit=20"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(mockListAdminDisputes).toHaveBeenCalledWith({
      includeResolved: false,
      limit: 20,
    });
  });

  it("passes includeResolved=1 to service", async () => {
    mockListAdminDisputes.mockResolvedValue([]);
    const res = await GET(
      new Request("http://localhost/api/admin/disputes?includeResolved=1&limit=10")
    );
    expect(res.status).toBe(200);
    expect(mockListAdminDisputes).toHaveBeenCalledWith({
      includeResolved: true,
      limit: 10,
    });
  });

  it("returns 500 when list fails", async () => {
    mockListAdminDisputes.mockRejectedValue(new Error("db fail"));
    const res = await GET(new Request("http://localhost/api/admin/disputes"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("db fail");
  });

  it("handles non-Error thrown from list service", async () => {
    mockListAdminDisputes.mockRejectedValue("string error");
    const res = await GET(new Request("http://localhost/api/admin/disputes"));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe("处理争议失败");
  });
});
