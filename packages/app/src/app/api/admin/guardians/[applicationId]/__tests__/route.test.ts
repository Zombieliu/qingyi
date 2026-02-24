import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockUpdateGuardianApplication,
  mockRemoveGuardianApplication,
  mockAddPlayer,
  mockGetPlayerByAddress,
  mockRecordAudit,
  mockIsValidSuiAddress,
  mockNormalizeSuiAddress,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockUpdateGuardianApplication: vi.fn(),
  mockRemoveGuardianApplication: vi.fn(),
  mockAddPlayer: vi.fn(),
  mockGetPlayerByAddress: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockIsValidSuiAddress: vi.fn(),
  mockNormalizeSuiAddress: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({
  updateGuardianApplication: mockUpdateGuardianApplication,
  removeGuardianApplication: mockRemoveGuardianApplication,
  addPlayer: mockAddPlayer,
  getPlayerByAddress: mockGetPlayerByAddress,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mockIsValidSuiAddress,
  normalizeSuiAddress: mockNormalizeSuiAddress,
}));

import { PATCH, DELETE } from "../route";

const authOk = { ok: true, role: "ops", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };
const ctx = { params: Promise.resolve({ applicationId: "gua-1" }) };

function makePatch(body: unknown) {
  return new Request("http://localhost/api/admin/guardians/gua-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeDelete() {
  return new Request("http://localhost/api/admin/guardians/gua-1", { method: "DELETE" });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockIsValidSuiAddress.mockReturnValue(true);
  mockNormalizeSuiAddress.mockImplementation((a: string) => a);
});

describe("PATCH /api/admin/guardians/[applicationId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockUpdateGuardianApplication.mockResolvedValue(null);
    const res = await PATCH(makePatch({ status: "面试中" }), ctx);
    expect(res.status).toBe(404);
  });

  it("updates guardian application", async () => {
    mockUpdateGuardianApplication.mockResolvedValue({ id: "gua-1", status: "面试中" });
    const res = await PATCH(makePatch({ status: "面试中" }), ctx);
    expect(res.status).toBe(200);
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("creates player when status is 已通过 with valid address", async () => {
    mockUpdateGuardianApplication.mockResolvedValue({
      id: "gua-1",
      status: "已通过",
      userAddress: "0xabc",
      user: "Test",
      contact: "12345678901",
    });
    mockGetPlayerByAddress.mockResolvedValue({ player: null, conflict: false });
    mockAddPlayer.mockResolvedValue(undefined);
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(200);
    expect(mockAddPlayer).toHaveBeenCalled();
  });

  it("returns 400 for invalid body", async () => {
    const req = new Request("http://localhost/api/admin/guardians/gua-1", {
      method: "PATCH",
      body: "not json",
    });
    const res = await PATCH(req, ctx);
    expect(res.status).toBe(400);
  });

  it("skips player creation when address is invalid", async () => {
    mockIsValidSuiAddress.mockReturnValue(false);
    mockUpdateGuardianApplication.mockResolvedValue({
      id: "gua-1",
      status: "已通过",
      userAddress: "bad",
      user: "Test",
    });
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(200);
    expect(mockAddPlayer).not.toHaveBeenCalled();
  });

  it("skips player creation when address is empty", async () => {
    mockUpdateGuardianApplication.mockResolvedValue({
      id: "gua-1",
      status: "已通过",
      userAddress: "",
      user: "Test",
    });
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(200);
    expect(mockAddPlayer).not.toHaveBeenCalled();
  });

  it("skips player creation when player already exists", async () => {
    mockUpdateGuardianApplication.mockResolvedValue({
      id: "gua-1",
      status: "已通过",
      userAddress: "0xabc",
      user: "Test",
    });
    mockGetPlayerByAddress.mockResolvedValue({ player: { id: "p1" }, conflict: false });
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(200);
    expect(mockAddPlayer).not.toHaveBeenCalled();
  });

  it("skips player creation when conflict exists", async () => {
    mockUpdateGuardianApplication.mockResolvedValue({
      id: "gua-1",
      status: "已通过",
      userAddress: "0xabc",
      user: "Test",
    });
    mockGetPlayerByAddress.mockResolvedValue({ player: null, conflict: true });
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(200);
    expect(mockAddPlayer).not.toHaveBeenCalled();
  });

  it("uses contact as name fallback when user is empty", async () => {
    mockUpdateGuardianApplication.mockResolvedValue({
      id: "gua-1",
      status: "已通过",
      userAddress: "0xabc",
      user: "",
      contact: "联系人",
    });
    mockGetPlayerByAddress.mockResolvedValue({ player: null, conflict: false });
    mockAddPlayer.mockResolvedValue(undefined);
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(200);
    expect(mockAddPlayer).toHaveBeenCalledWith(expect.objectContaining({ name: "联系人" }));
  });

  it("uses default name when user and contact are empty", async () => {
    mockUpdateGuardianApplication.mockResolvedValue({
      id: "gua-1",
      status: "已通过",
      userAddress: "0xabc",
      user: "",
      contact: "",
    });
    mockGetPlayerByAddress.mockResolvedValue({ player: null, conflict: false });
    mockAddPlayer.mockResolvedValue(undefined);
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(200);
    expect(mockAddPlayer).toHaveBeenCalledWith(expect.objectContaining({ name: "陪练" }));
  });

  it("builds notes from games, experience, availability, and note", async () => {
    mockUpdateGuardianApplication.mockResolvedValue({
      id: "gua-1",
      status: "已通过",
      userAddress: "0xabc",
      user: "Test",
      games: "LOL",
      experience: "钻石",
      availability: "晚上",
      note: "备注",
    });
    mockGetPlayerByAddress.mockResolvedValue({ player: null, conflict: false });
    mockAddPlayer.mockResolvedValue(undefined);
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(200);
    expect(mockAddPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: expect.stringContaining("擅长游戏：LOL"),
      })
    );
  });

  it("sets notes to undefined when no extra fields", async () => {
    mockUpdateGuardianApplication.mockResolvedValue({
      id: "gua-1",
      status: "已通过",
      userAddress: "0xabc",
      user: "Test",
    });
    mockGetPlayerByAddress.mockResolvedValue({ player: null, conflict: false });
    mockAddPlayer.mockResolvedValue(undefined);
    const res = await PATCH(makePatch({ status: "已通过" }), ctx);
    expect(res.status).toBe(200);
    expect(mockAddPlayer).toHaveBeenCalledWith(expect.objectContaining({ notes: undefined }));
  });

  it("does not create player when status is not 已通过", async () => {
    mockUpdateGuardianApplication.mockResolvedValue({
      id: "gua-1",
      status: "面试中",
      userAddress: "0xabc",
    });
    const res = await PATCH(makePatch({ status: "面试中" }), ctx);
    expect(res.status).toBe(200);
    expect(mockAddPlayer).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/admin/guardians/[applicationId]", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await DELETE(makeDelete(), ctx);
    expect(res.status).toBe(401);
  });

  it("returns 404 when not found", async () => {
    mockRemoveGuardianApplication.mockResolvedValue(false);
    const res = await DELETE(makeDelete(), ctx);
    expect(res.status).toBe(404);
  });

  it("deletes guardian application", async () => {
    mockRemoveGuardianApplication.mockResolvedValue(true);
    const res = await DELETE(makeDelete(), ctx);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockRecordAudit).toHaveBeenCalled();
  });
});
