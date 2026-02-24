import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockUpdateMantouWithdrawStatus } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockUpdateMantouWithdrawStatus: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  updateMantouWithdrawStatus: mockUpdateMantouWithdrawStatus,
}));

import { PATCH } from "../route";

const authOk = { ok: true, role: "finance", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
const ctx = { params: Promise.resolve({ requestId: "req-1" }) };

function makePatch(body: unknown) {
  return new Request("http://localhost/api/admin/mantou/withdraws/req-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("PATCH /api/admin/mantou/withdraws/[requestId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid status", async () => {
    const res = await PATCH(makePatch({ status: "invalid" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when not found", async () => {
    mockUpdateMantouWithdrawStatus.mockResolvedValue(null);
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(404);
  });

  it("updates withdraw status successfully", async () => {
    mockUpdateMantouWithdrawStatus.mockResolvedValue({ id: "req-1", status: "已通过" });
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    const json = await res.json();
    expect(json.status).toBe("已通过");
  });

  it("returns 500 on error", async () => {
    mockUpdateMantouWithdrawStatus.mockRejectedValue(new Error("db error"));
    const res = await PATCH(makePatch({ status: "已打款" }), ctx);
    expect(res.status).toBe(500);
  });
});
