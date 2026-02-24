import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockUpdateMembershipTier, mockRemoveMembershipTier, mockRecordAudit } =
  vi.hoisted(() => ({
    mockRequireAdmin: vi.fn(),
    mockUpdateMembershipTier: vi.fn(),
    mockRemoveMembershipTier: vi.fn(),
    mockRecordAudit: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  updateMembershipTier: mockUpdateMembershipTier,
  removeMembershipTier: mockRemoveMembershipTier,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));

import { PATCH, DELETE } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
const ctx = { params: Promise.resolve({ tierId: "tier-1" }) };

function makePatch(body: unknown) {
  return new Request("http://localhost/api/admin/vip/tiers/tier-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDelete() {
  return new Request("http://localhost/api/admin/vip/tiers/tier-1", { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("PATCH /api/admin/vip/tiers/[tierId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await PATCH(makePatch({ name: "Gold" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockUpdateMembershipTier.mockResolvedValue(null);
    const res = await PATCH(makePatch({ name: "Gold" }), ctx);
    expect(res.status).toBe(404);
  });

  it("updates tier successfully", async () => {
    mockUpdateMembershipTier.mockResolvedValue({ id: "tier-1", name: "Gold", status: "上架" });
    const res = await PATCH(makePatch({ name: "Gold" }), ctx);
    expect(res.status).toBe(200);
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("handles perks as string", async () => {
    mockUpdateMembershipTier.mockResolvedValue({ id: "tier-1", status: "上架" });
    const res = await PATCH(makePatch({ perks: "perk1\nperk2|desc" }), ctx);
    expect(res.status).toBe(200);
  });

  it("returns 400 for invalid body", async () => {
    const req = new Request("http://localhost/api/admin/vip/tiers/tier-1", {
      method: "PATCH",
      body: "not json",
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it("handles perks as array of strings", async () => {
    mockUpdateMembershipTier.mockResolvedValue({ id: "tier-1", status: "上架" });
    const res = await PATCH(makePatch({ perks: ["perk1", "perk2"] }), ctx);
    expect(res.status).toBe(200);
  });

  it("handles perks as array of objects", async () => {
    mockUpdateMembershipTier.mockResolvedValue({ id: "tier-1", status: "上架" });
    const res = await PATCH(makePatch({ perks: [{ label: "perk1", desc: "desc1" }] }), ctx);
    expect(res.status).toBe(200);
  });

  it("handles perks as undefined", async () => {
    mockUpdateMembershipTier.mockResolvedValue({ id: "tier-1", status: "上架" });
    const res = await PATCH(makePatch({ name: "Gold" }), ctx);
    expect(res.status).toBe(200);
  });

  it("handles perks string with no desc part", async () => {
    mockUpdateMembershipTier.mockResolvedValue({ id: "tier-1", status: "上架" });
    const res = await PATCH(makePatch({ perks: "perk1\nperk2" }), ctx);
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/admin/vip/tiers/[tierId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await DELETE(makeDelete(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockRemoveMembershipTier.mockResolvedValue(false);
    const res = await DELETE(makeDelete(), ctx);
    expect(res.status).toBe(404);
  });

  it("deletes tier successfully", async () => {
    mockRemoveMembershipTier.mockResolvedValue(true);
    const res = await DELETE(makeDelete(), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
