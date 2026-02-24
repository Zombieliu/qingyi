import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockPrisma, mockRecordAudit } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockPrisma: { redeemCode: { update: vi.fn() } },
  mockRecordAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));

import { PATCH } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
const ctx = { params: Promise.resolve({ codeId: "code-1" }) };

function makePatch(body: unknown) {
  return new Request("http://localhost/api/admin/redeem/codes/code-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("PATCH /api/admin/redeem/codes/[codeId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await PATCH(makePatch({ status: "disabled" }), ctx);
    expect(res.status).toBe(401);
  });

  it("updates redeem code successfully", async () => {
    mockPrisma.redeemCode.update.mockResolvedValue({ id: "code-1" });
    const res = await PATCH(makePatch({ status: "disabled" }), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("returns 400 when codeId is empty", async () => {
    const emptyCtx = { params: Promise.resolve({ codeId: "" }) };
    const res = await PATCH(makePatch({ status: "disabled" }), emptyCtx);
    expect(res.status).toBe(400);
  });

  it("handles startsAt and expiresAt as timestamps", async () => {
    mockPrisma.redeemCode.update.mockResolvedValue({ id: "code-1" });
    const res = await PATCH(makePatch({ startsAt: 1700000000000, expiresAt: "2025-12-31" }), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("handles null startsAt and expiresAt", async () => {
    mockPrisma.redeemCode.update.mockResolvedValue({ id: "code-1" });
    const res = await PATCH(makePatch({ startsAt: null, expiresAt: null }), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("handles startsAt as numeric string", async () => {
    mockPrisma.redeemCode.update.mockResolvedValue({ id: "code-1" });
    const res = await PATCH(makePatch({ startsAt: "1700000000000" }), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("handles empty string startsAt", async () => {
    mockPrisma.redeemCode.update.mockResolvedValue({ id: "code-1" });
    const res = await PATCH(makePatch({ startsAt: "", expiresAt: " " }), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("handles invalid date string for startsAt", async () => {
    mockPrisma.redeemCode.update.mockResolvedValue({ id: "code-1" });
    const res = await PATCH(makePatch({ startsAt: "not-a-date" }), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("returns 400 for invalid body (bad status value)", async () => {
    const res = await PATCH(makePatch({ status: "invalid_status" }), ctx);
    expect(res.status).toBe(400);
  });
});
