import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockUpdateMember, mockRemoveMember, mockRecordAudit } = vi.hoisted(
  () => ({
    mockRequireAdmin: vi.fn(),
    mockUpdateMember: vi.fn(),
    mockRemoveMember: vi.fn(),
    mockRecordAudit: vi.fn(),
  })
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  updateMember: mockUpdateMember,
  removeMember: mockRemoveMember,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));

import { PATCH, DELETE } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
const ctx = { params: Promise.resolve({ memberId: "mbr-1" }) };

function makePatch(body: unknown) {
  return new Request("http://localhost/api/admin/vip/members/mbr-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDelete() {
  return new Request("http://localhost/api/admin/vip/members/mbr-1", { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("PATCH /api/admin/vip/members/[memberId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await PATCH(makePatch({ status: "有效" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockUpdateMember.mockResolvedValue(null);
    const res = await PATCH(makePatch({ status: "有效" }), ctx);
    expect(res.status).toBe(404);
  });

  it("updates member successfully", async () => {
    mockUpdateMember.mockResolvedValue({ id: "mbr-1", status: "有效" });
    const res = await PATCH(makePatch({ status: "有效" }), ctx);
    expect(res.status).toBe(200);
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("returns 400 for invalid body", async () => {
    const req = new Request("http://localhost/api/admin/vip/members/mbr-1", {
      method: "PATCH",
      body: "not json",
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it("updates member with multiple fields", async () => {
    mockUpdateMember.mockResolvedValue({ id: "mbr-1", status: "有效" });
    const res = await PATCH(makePatch({ status: "有效", note: "test", points: 100 }), ctx);
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/admin/vip/members/[memberId]", () => {
  it("returns 404 when not found", async () => {
    mockRemoveMember.mockResolvedValue(false);
    const res = await DELETE(makeDelete(), ctx);
    expect(res.status).toBe(404);
  });

  it("deletes member successfully", async () => {
    mockRemoveMember.mockResolvedValue(true);
    const res = await DELETE(makeDelete(), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
