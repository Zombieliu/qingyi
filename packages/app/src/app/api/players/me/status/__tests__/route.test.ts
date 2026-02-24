import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  getPlayerByAddress: vi.fn(),
  updatePlayerStatusByAddress: vi.fn(),
  recordAudit: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
  parseBodyRaw: vi.fn(),
}));

vi.mock("next/server", () => {
  class MockNextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map();
    }
    async json() {
      return this.body;
    }
    static json(data: unknown, init?: { status?: number }) {
      return new MockNextResponse(data, init);
    }
  }
  return { NextResponse: MockNextResponse };
});

vi.mock("@/lib/auth/user-auth", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("@/lib/admin/admin-store", () => ({
  getPlayerByAddress: mocks.getPlayerByAddress,
  updatePlayerStatusByAddress: mocks.updatePlayerStatusByAddress,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));
vi.mock("@/lib/shared/api-validation", () => ({ parseBodyRaw: mocks.parseBodyRaw }));

import { GET, PATCH } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

describe("GET /api/players/me/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
  });

  it("returns 400 for invalid address", async () => {
    mocks.normalizeSuiAddress.mockReturnValue("");
    mocks.isValidSuiAddress.mockReturnValue(false);
    const req = new Request("http://localhost/api/players/me/status?address=bad");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = new Request(`http://localhost/api/players/me/status?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 409 on address conflict", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getPlayerByAddress.mockResolvedValue({ conflict: true, player: null });
    const req = new Request(`http://localhost/api/players/me/status?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(409);
  });

  it("returns 404 when player not found", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getPlayerByAddress.mockResolvedValue({ conflict: false, player: null });
    const req = new Request(`http://localhost/api/players/me/status?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(404);
  });

  it("returns player status", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getPlayerByAddress.mockResolvedValue({
      conflict: false,
      player: { id: "P-1", status: "可接单" },
    });
    const req = new Request(`http://localhost/api/players/me/status?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("P-1");
    expect(body.status).toBe("可接单");
  });
});

describe("PATCH /api/players/me/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
    mocks.recordAudit.mockResolvedValue(undefined);
  });

  it("returns validation error for invalid body", async () => {
    const errResp = { status: 400, json: async () => ({ error: "Invalid" }) };
    mocks.parseBodyRaw.mockResolvedValue({ success: false, response: errResp });
    const req = new Request("http://localhost/api/players/me/status", { method: "PATCH" });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it("returns 403 when player is disabled", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, status: "可接单" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getPlayerByAddress.mockResolvedValue({
      conflict: false,
      player: { id: "P-1", status: "停用" },
    });
    const req = new Request("http://localhost/api/players/me/status", { method: "PATCH" });
    const res = await PATCH(req);
    expect(res.status).toBe(403);
  });

  it("updates player status successfully", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, status: "忙碌" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getPlayerByAddress.mockResolvedValue({
      conflict: false,
      player: { id: "P-1", status: "可接单" },
    });
    mocks.updatePlayerStatusByAddress.mockResolvedValue({
      conflict: false,
      player: { id: "P-1", status: "忙碌" },
    });
    const req = new Request("http://localhost/api/players/me/status", { method: "PATCH" });
    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("忙碌");
    expect(mocks.recordAudit).toHaveBeenCalled();
  });

  it("returns 400 for invalid address in PATCH", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: "bad", status: "可接单" },
      rawBody: "{}",
    });
    mocks.normalizeSuiAddress.mockReturnValue("");
    mocks.isValidSuiAddress.mockReturnValue(false);
    const req = new Request("http://localhost/api/players/me/status", { method: "PATCH" });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_address");
  });

  it("returns auth error in PATCH when user auth fails", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, status: "可接单" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = new Request("http://localhost/api/players/me/status", { method: "PATCH" });
    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it("returns 409 on address conflict in PATCH getPlayerByAddress", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, status: "可接单" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getPlayerByAddress.mockResolvedValue({ conflict: true, player: null });
    const req = new Request("http://localhost/api/players/me/status", { method: "PATCH" });
    const res = await PATCH(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("address_conflict");
  });

  it("returns 404 when player not found in PATCH", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, status: "可接单" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getPlayerByAddress.mockResolvedValue({ conflict: false, player: null });
    const req = new Request("http://localhost/api/players/me/status", { method: "PATCH" });
    const res = await PATCH(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("player_not_found");
  });

  it("returns 409 on address conflict in updatePlayerStatusByAddress", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, status: "忙碌" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getPlayerByAddress.mockResolvedValue({
      conflict: false,
      player: { id: "P-1", status: "可接单" },
    });
    mocks.updatePlayerStatusByAddress.mockResolvedValue({ conflict: true, player: null });
    const req = new Request("http://localhost/api/players/me/status", { method: "PATCH" });
    const res = await PATCH(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("address_conflict");
  });

  it("returns 404 when updatePlayerStatusByAddress returns no player", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, status: "忙碌" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getPlayerByAddress.mockResolvedValue({
      conflict: false,
      player: { id: "P-1", status: "可接单" },
    });
    mocks.updatePlayerStatusByAddress.mockResolvedValue({ conflict: false, player: null });
    const req = new Request("http://localhost/api/players/me/status", { method: "PATCH" });
    const res = await PATCH(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("player_not_found");
  });
});
