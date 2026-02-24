import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockUpdatePlayer,
  mockRemovePlayer,
  mockGetPlayerByAddress,
  mockRecordAudit,
  mockIsValidSuiAddress,
  mockNormalizeSuiAddress,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockUpdatePlayer: vi.fn(),
  mockRemovePlayer: vi.fn(),
  mockGetPlayerByAddress: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockIsValidSuiAddress: vi.fn(),
  mockNormalizeSuiAddress: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  updatePlayer: mockUpdatePlayer,
  removePlayer: mockRemovePlayer,
  getPlayerByAddress: mockGetPlayerByAddress,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mockIsValidSuiAddress,
  normalizeSuiAddress: mockNormalizeSuiAddress,
}));

import { PATCH, DELETE } from "../route";

const authOk = { ok: true, role: "viewer", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
const ctx = { params: Promise.resolve({ playerId: "ply-1" }) };

function makePatch(body: unknown) {
  return new Request("http://localhost/api/admin/players/ply-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDelete() {
  return new Request("http://localhost/api/admin/players/ply-1", { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockIsValidSuiAddress.mockReturnValue(true);
  mockNormalizeSuiAddress.mockImplementation((a: string) => a);
});

describe("PATCH /api/admin/players/[playerId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await PATCH(makePatch({ name: "x" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 when playerId is empty", async () => {
    const emptyCtx = { params: Promise.resolve({ playerId: "" }) };
    const res = await PATCH(makePatch({ name: "x" }), emptyCtx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Missing playerId");
  });

  it("returns 400 for invalid body", async () => {
    const req = new Request("http://localhost/api/admin/players/ply-1", {
      method: "PATCH",
      body: "not-json",
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it("returns 404 when not found", async () => {
    mockUpdatePlayer.mockResolvedValue(null);
    const res = await PATCH(makePatch({ name: "x" }), ctx);
    expect(res.status).toBe(404);
  });

  it("updates player successfully", async () => {
    mockUpdatePlayer.mockResolvedValue({ id: "ply-1", name: "x" });
    const res = await PATCH(makePatch({ name: "x" }), ctx);
    expect(res.status).toBe(200);
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("validates contact as mobile number", async () => {
    const res = await PATCH(makePatch({ contact: "abc" }), ctx);
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty contact", async () => {
    const res = await PATCH(makePatch({ contact: "  " }), ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("contact_required");
  });

  it("accepts valid mobile contact", async () => {
    mockUpdatePlayer.mockResolvedValue({ id: "ply-1", contact: "13800138000" });
    const res = await PATCH(makePatch({ contact: "13800138000" }), ctx);
    expect(res.status).toBe(200);
  });

  it("validates address as sui address", async () => {
    mockIsValidSuiAddress.mockReturnValue(false);
    mockNormalizeSuiAddress.mockReturnValue("invalid");
    const res = await PATCH(makePatch({ address: "invalid" }), ctx);
    expect(res.status).toBe(400);
  });

  it("allows clearing address to empty string", async () => {
    mockUpdatePlayer.mockResolvedValue({ id: "ply-1", address: "" });
    const res = await PATCH(makePatch({ address: "" }), ctx);
    expect(res.status).toBe(200);
  });

  it("checks address conflict", async () => {
    mockGetPlayerByAddress.mockResolvedValue({ player: { id: "other" }, conflict: false });
    const res = await PATCH(makePatch({ address: "0xabc" }), ctx);
    expect(res.status).toBe(409);
  });

  it("returns 409 when address has conflict flag", async () => {
    mockGetPlayerByAddress.mockResolvedValue({ player: null, conflict: true });
    const res = await PATCH(makePatch({ address: "0xabc" }), ctx);
    expect(res.status).toBe(409);
  });

  it("allows address when same player owns it", async () => {
    mockGetPlayerByAddress.mockResolvedValue({ player: { id: "ply-1" }, conflict: false });
    mockUpdatePlayer.mockResolvedValue({ id: "ply-1", address: "0xabc" });
    const res = await PATCH(makePatch({ address: "0xabc" }), ctx);
    expect(res.status).toBe(200);
  });

  it("returns 400 for negative depositBase", async () => {
    const res = await PATCH(makePatch({ depositBase: -1 }), ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("depositBase");
  });

  it("returns 400 for negative depositLocked", async () => {
    const res = await PATCH(makePatch({ depositLocked: -1 }), ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toContain("depositLocked");
  });

  it("clamps creditMultiplier between 1 and 5", async () => {
    mockUpdatePlayer.mockResolvedValue({ id: "ply-1", creditMultiplier: 5 });
    await PATCH(makePatch({ creditMultiplier: 10 }), ctx);
    expect(mockUpdatePlayer).toHaveBeenCalledWith(
      "ply-1",
      expect.objectContaining({ creditMultiplier: 5 })
    );
  });

  it("clamps creditMultiplier minimum to 1", async () => {
    mockUpdatePlayer.mockResolvedValue({ id: "ply-1", creditMultiplier: 1 });
    await PATCH(makePatch({ creditMultiplier: 0 }), ctx);
    expect(mockUpdatePlayer).toHaveBeenCalledWith(
      "ply-1",
      expect.objectContaining({ creditMultiplier: 1 })
    );
  });

  it("updates role field", async () => {
    mockUpdatePlayer.mockResolvedValue({ id: "ply-1", role: "辅助" });
    const res = await PATCH(makePatch({ role: "辅助" }), ctx);
    expect(res.status).toBe(200);
  });

  it("updates status field", async () => {
    mockUpdatePlayer.mockResolvedValue({ id: "ply-1", status: "忙碌" });
    const res = await PATCH(makePatch({ status: "忙碌" }), ctx);
    expect(res.status).toBe(200);
  });

  it("updates wechatQr and alipayQr", async () => {
    mockUpdatePlayer.mockResolvedValue({ id: "ply-1" });
    const res = await PATCH(makePatch({ wechatQr: "qr1", alipayQr: "qr2" }), ctx);
    expect(res.status).toBe(200);
    expect(mockUpdatePlayer).toHaveBeenCalledWith(
      "ply-1",
      expect.objectContaining({ wechatQr: "qr1", alipayQr: "qr2" })
    );
  });

  it("updates notes field", async () => {
    mockUpdatePlayer.mockResolvedValue({ id: "ply-1" });
    const res = await PATCH(makePatch({ notes: "some notes" }), ctx);
    expect(res.status).toBe(200);
    expect(mockUpdatePlayer).toHaveBeenCalledWith(
      "ply-1",
      expect.objectContaining({ notes: "some notes" })
    );
  });

  it("handles normalizePlayerAddress throwing error", async () => {
    mockNormalizeSuiAddress.mockImplementation(() => {
      throw new Error("bad");
    });
    const res = await PATCH(makePatch({ address: "0xbad" }), ctx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_address");
  });
});

describe("DELETE /api/admin/players/[playerId]", () => {
  it("returns 401 when auth fails on DELETE", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await DELETE(makeDelete(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 400 when playerId is empty on DELETE", async () => {
    const emptyCtx = { params: Promise.resolve({ playerId: "" }) };
    const res = await DELETE(makeDelete(), emptyCtx);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Missing playerId");
  });

  it("returns 404 when not found", async () => {
    mockRemovePlayer.mockResolvedValue(null);
    const res = await DELETE(makeDelete(), ctx);
    expect(res.status).toBe(404);
  });

  it("deletes player successfully", async () => {
    mockRemovePlayer.mockResolvedValue(true);
    const res = await DELETE(makeDelete(), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});
