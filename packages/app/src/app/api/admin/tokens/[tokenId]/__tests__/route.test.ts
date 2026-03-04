import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockUpdateAccessToken, mockRemoveAccessToken, mockRecordAudit } =
  vi.hoisted(() => ({
    mockRequireAdmin: vi.fn(),
    mockUpdateAccessToken: vi.fn(),
    mockRemoveAccessToken: vi.fn(),
    mockRecordAudit: vi.fn(),
  }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/session-store-edge", () => ({
  updateAccessToken: mockUpdateAccessToken,
  removeAccessToken: mockRemoveAccessToken,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));

import { PATCH, DELETE } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
const ctx = { params: Promise.resolve({ tokenId: "tok-1" }) };

function makePatch(body: unknown) {
  return new Request("http://localhost/api/admin/tokens/tok-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDelete() {
  return new Request("http://localhost/api/admin/tokens/tok-1", { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("PATCH /api/admin/tokens/[tokenId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await PATCH(makePatch({ label: "x" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 for empty patch", async () => {
    const res = await PATCH(makePatch({}), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when not found", async () => {
    mockUpdateAccessToken.mockResolvedValue(null);
    const res = await PATCH(makePatch({ label: "x" }), ctx);
    expect(res.status).toBe(404);
  });

  it("returns 400 for invalid body", async () => {
    const req = new Request("http://localhost/api/admin/tokens/tok-1", {
      method: "PATCH",
      body: "not-json",
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it("updates token role and status", async () => {
    mockUpdateAccessToken.mockResolvedValue({
      id: "tok-1",
      tokenPrefix: "abc",
      role: "ops",
      label: "test",
      status: "disabled",
      createdAt: 1000,
      updatedAt: 2000,
      lastUsedAt: null,
    });
    const res = await PATCH(makePatch({ role: "ops", status: "disabled" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.role).toBe("ops");
    expect(json.status).toBe("disabled");
  });

  it("updates token successfully", async () => {
    mockUpdateAccessToken.mockResolvedValue({
      id: "tok-1",
      tokenPrefix: "abc",
      role: "admin",
      label: "x",
      status: "active",
      createdAt: 1000,
      updatedAt: 2000,
      lastUsedAt: null,
    });
    const res = await PATCH(makePatch({ label: "x" }), ctx);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.label).toBe("x");
    expect(mockRecordAudit).toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/tokens/[tokenId]", () => {
  it("returns 401 when auth fails on DELETE", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await DELETE(makeDelete(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockRemoveAccessToken.mockResolvedValue(null);
    const res = await DELETE(makeDelete(), ctx);
    expect(res.status).toBe(404);
  });

  it("deletes token successfully", async () => {
    mockRemoveAccessToken.mockResolvedValue(true);
    const res = await DELETE(makeDelete(), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
