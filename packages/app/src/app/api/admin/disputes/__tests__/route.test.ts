import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockResolveDispute } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockResolveDispute: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/services/dispute-service", () => ({ resolveDispute: mockResolveDispute }));

import { POST } from "../route";

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
    const res = await POST(makePost({ orderId: "1", resolution: "refund" }));
    const json = await res.json();
    expect(json.id).toBe("d1");
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
