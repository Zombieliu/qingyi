import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockUpdateMembershipRequest,
  mockRemoveMembershipRequest,
  mockGetMemberByAddress,
  mockGetMembershipTierById,
  mockUpdateMember,
  mockAddMember,
  mockRecordAudit,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockUpdateMembershipRequest: vi.fn(),
  mockRemoveMembershipRequest: vi.fn(),
  mockGetMemberByAddress: vi.fn(),
  mockGetMembershipTierById: vi.fn(),
  mockUpdateMember: vi.fn(),
  mockAddMember: vi.fn(),
  mockRecordAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  updateMembershipRequest: mockUpdateMembershipRequest,
  removeMembershipRequest: mockRemoveMembershipRequest,
  getMemberByAddress: mockGetMemberByAddress,
  getMembershipTierById: mockGetMembershipTierById,
  updateMember: mockUpdateMember,
  addMember: mockAddMember,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));

import { PATCH, DELETE } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
const ctx = { params: Promise.resolve({ requestId: "req-1" }) };

function makePatch(body: unknown) {
  return new Request("http://localhost/api/admin/vip/requests/req-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDelete() {
  return new Request("http://localhost/api/admin/vip/requests/req-1", { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("PATCH /api/admin/vip/requests/[requestId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockUpdateMembershipRequest.mockResolvedValue(null);
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(404);
  });

  it("updates request successfully", async () => {
    mockUpdateMembershipRequest.mockResolvedValue({ id: "req-1", status: "待审核" });
    const res = await PATCH(makePatch({ status: "待审核" }), ctx);
    expect(res.status).toBe(200);
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("creates member when approved with userAddress", async () => {
    mockUpdateMembershipRequest.mockResolvedValue({
      id: "req-1",
      status: "已通过",
      userAddress: "0x1",
      tierId: "t1",
      tierName: "Gold",
    });
    mockGetMembershipTierById.mockResolvedValue({ durationDays: 30 });
    mockGetMemberByAddress.mockResolvedValue(null);
    mockAddMember.mockResolvedValue(undefined);
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(200);
    expect(mockAddMember).toHaveBeenCalled();
  });

  it("updates existing member when approved", async () => {
    mockUpdateMembershipRequest.mockResolvedValue({
      id: "req-1",
      status: "已通过",
      userAddress: "0x1",
      tierId: "t1",
      tierName: "Gold",
    });
    mockGetMembershipTierById.mockResolvedValue({ durationDays: 30 });
    mockGetMemberByAddress.mockResolvedValue({ id: "mbr-1" });
    mockUpdateMember.mockResolvedValue(undefined);
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(200);
    expect(mockUpdateMember).toHaveBeenCalled();
  });

  it("returns 400 for invalid body", async () => {
    const req = new Request("http://localhost/api/admin/vip/requests/req-1", {
      method: "PATCH",
      body: "not json",
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it("uses default 30 days when tier not found", async () => {
    mockUpdateMembershipRequest.mockResolvedValue({
      id: "req-1",
      status: "已通过",
      userAddress: "0x1",
      tierId: null,
      tierName: "Gold",
    });
    mockGetMemberByAddress.mockResolvedValue(null);
    mockAddMember.mockResolvedValue(undefined);
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(200);
    expect(mockAddMember).toHaveBeenCalled();
  });

  it("does not create member when status is not 已通过", async () => {
    mockUpdateMembershipRequest.mockResolvedValue({
      id: "req-1",
      status: "待审核",
      userAddress: "0x1",
    });
    const res = await PATCH(makePatch({ status: "待审核" }), ctx);
    expect(res.status).toBe(200);
    expect(mockAddMember).not.toHaveBeenCalled();
    expect(mockUpdateMember).not.toHaveBeenCalled();
  });

  it("does not create member when userAddress is missing", async () => {
    mockUpdateMembershipRequest.mockResolvedValue({
      id: "req-1",
      status: "已通过",
    });
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(200);
    expect(mockAddMember).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/vip/requests/[requestId]", () => {
  it("returns 404 when not found", async () => {
    mockRemoveMembershipRequest.mockResolvedValue(false);
    const res = await DELETE(makeDelete(), ctx);
    expect(res.status).toBe(404);
  });

  it("deletes request successfully", async () => {
    mockRemoveMembershipRequest.mockResolvedValue(true);
    const res = await DELETE(makeDelete(), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
