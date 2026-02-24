import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockUpdateCoupon, mockRemoveCoupon, mockRecordAudit } = vi.hoisted(
  () => ({
    mockRequireAdmin: vi.fn(),
    mockUpdateCoupon: vi.fn(),
    mockRemoveCoupon: vi.fn(),
    mockRecordAudit: vi.fn(),
  })
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  updateCoupon: mockUpdateCoupon,
  removeCoupon: mockRemoveCoupon,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));

import { PATCH, DELETE } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
const ctx = { params: Promise.resolve({ couponId: "cpn-1" }) };

function makePatch(body: unknown) {
  return new Request("http://localhost/api/admin/coupons/cpn-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDelete() {
  return new Request("http://localhost/api/admin/coupons/cpn-1", { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("PATCH /api/admin/coupons/[couponId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await PATCH(makePatch({ title: "x" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockUpdateCoupon.mockResolvedValue(null);
    const res = await PATCH(makePatch({ title: "x" }), ctx);
    expect(res.status).toBe(404);
  });

  it("updates coupon successfully", async () => {
    mockUpdateCoupon.mockResolvedValue({ id: "cpn-1", title: "x", status: "可用" });
    const res = await PATCH(makePatch({ title: "x" }), ctx);
    expect(res.status).toBe(200);
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("returns 400 for invalid body", async () => {
    const req = new Request("http://localhost/api/admin/coupons/cpn-1", {
      method: "PATCH",
      body: "not json",
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it("handles startsAt as string date", async () => {
    mockUpdateCoupon.mockResolvedValue({ id: "cpn-1", status: "可用" });
    const res = await PATCH(makePatch({ startsAt: "2024-01-01" }), ctx);
    expect(res.status).toBe(200);
  });

  it("handles startsAt as number", async () => {
    mockUpdateCoupon.mockResolvedValue({ id: "cpn-1", status: "可用" });
    const res = await PATCH(makePatch({ startsAt: 1704067200000 }), ctx);
    expect(res.status).toBe(200);
  });

  it("handles startsAt as null", async () => {
    mockUpdateCoupon.mockResolvedValue({ id: "cpn-1", status: "可用" });
    const res = await PATCH(makePatch({ startsAt: null }), ctx);
    expect(res.status).toBe(200);
  });

  it("handles expiresAt as null", async () => {
    mockUpdateCoupon.mockResolvedValue({ id: "cpn-1", status: "可用" });
    const res = await PATCH(makePatch({ expiresAt: null }), ctx);
    expect(res.status).toBe(200);
  });

  it("handles invalid date string", async () => {
    mockUpdateCoupon.mockResolvedValue({ id: "cpn-1", status: "可用" });
    const res = await PATCH(makePatch({ startsAt: "not-a-date" }), ctx);
    expect(res.status).toBe(200);
  });

  it("handles empty string date", async () => {
    mockUpdateCoupon.mockResolvedValue({ id: "cpn-1", status: "可用" });
    const res = await PATCH(makePatch({ startsAt: "" }), ctx);
    expect(res.status).toBe(200);
  });
});

describe("DELETE /api/admin/coupons/[couponId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await DELETE(makeDelete(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockRemoveCoupon.mockResolvedValue(false);
    const res = await DELETE(makeDelete(), ctx);
    expect(res.status).toBe(404);
  });

  it("deletes coupon successfully", async () => {
    mockRemoveCoupon.mockResolvedValue(true);
    const res = await DELETE(makeDelete(), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockRecordAudit).toHaveBeenCalled();
  });
});
