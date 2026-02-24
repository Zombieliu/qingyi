import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockAddPlayer,
  mockGetPlayerByAddress,
  mockListPlayers,
  mockRecordAudit,
  mockIsValidSuiAddress,
  mockNormalizeSuiAddress,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockAddPlayer: vi.fn(),
  mockGetPlayerByAddress: vi.fn(),
  mockListPlayers: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockIsValidSuiAddress: vi.fn(),
  mockNormalizeSuiAddress: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/admin/admin-store", () => ({
  addPlayer: mockAddPlayer,
  getPlayerByAddress: mockGetPlayerByAddress,
  listPlayers: mockListPlayers,
}));

vi.mock("@/lib/admin/admin-audit", () => ({
  recordAudit: mockRecordAudit,
}));

vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mockIsValidSuiAddress,
  normalizeSuiAddress: mockNormalizeSuiAddress,
}));

import { GET, POST } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = {
  ok: false,
  response: Response.json({ error: "Unauthorized" }, { status: 401 }),
};

const validBody = {
  name: "Player1",
  contact: "13800138000",
  address: "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
};

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/admin/players", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockNormalizeSuiAddress.mockImplementation((a: string) => a);
  mockIsValidSuiAddress.mockReturnValue(true);
  mockGetPlayerByAddress.mockResolvedValue({ player: null, conflict: false });
});

describe("GET /api/admin/players", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(new Request("http://localhost/api/admin/players"));
    expect(res.status).toBe(401);
  });

  it("returns list of players", async () => {
    const players = [{ id: "p1", name: "A" }];
    mockListPlayers.mockResolvedValue(players);
    const res = await GET(new Request("http://localhost/api/admin/players"));
    const json = await res.json();
    expect(json).toEqual(players);
  });
});
describe("POST /api/admin/players", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid JSON", async () => {
    const req = new Request("http://localhost/api/admin/players", {
      method: "POST",
      body: "bad",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when required fields are missing", async () => {
    const res = await POST(makePostRequest({ name: "A" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid contact format", async () => {
    const res = await POST(makePostRequest({ ...validBody, contact: "abc" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid sui address", async () => {
    mockIsValidSuiAddress.mockReturnValue(false);
    mockNormalizeSuiAddress.mockImplementation(() => {
      throw new Error("bad");
    });
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_address");
  });

  it("returns 409 when address is already in use", async () => {
    mockGetPlayerByAddress.mockResolvedValue({ player: { id: "p1" }, conflict: false });
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("address_in_use");
  });

  it("creates player with defaults and returns 201", async () => {
    mockAddPlayer.mockResolvedValue(undefined);
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.name).toBe("Player1");
    expect(json.status).toBe("可接单");
    expect(json.id).toMatch(/^PLY-/);
  });

  it("clamps creditMultiplier between 1 and 5", async () => {
    mockAddPlayer.mockResolvedValue(undefined);
    const res = await POST(makePostRequest({ ...validBody, creditMultiplier: 10 }));
    const json = await res.json();
    expect(json.creditMultiplier).toBe(5);
  });

  it("calls addPlayer and recordAudit on success", async () => {
    mockAddPlayer.mockResolvedValue(undefined);
    await POST(makePostRequest(validBody));
    expect(mockAddPlayer).toHaveBeenCalledTimes(1);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.anything(),
      authOk,
      "players.create",
      "player",
      expect.stringMatching(/^PLY-/),
      expect.objectContaining({ name: "Player1", status: "可接单" })
    );
  });

  it("clamps creditMultiplier below 1 to 1", async () => {
    mockAddPlayer.mockResolvedValue(undefined);
    const res = await POST(makePostRequest({ ...validBody, creditMultiplier: 0 }));
    const json = await res.json();
    expect(json.creditMultiplier).toBe(1);
  });

  it("returns 409 when address has conflict", async () => {
    mockGetPlayerByAddress.mockResolvedValue({ player: null, conflict: true });
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(409);
  });

  it("uses custom id when provided", async () => {
    mockAddPlayer.mockResolvedValue(undefined);
    const res = await POST(makePostRequest({ ...validBody, id: "CUSTOM-ID" }));
    const json = await res.json();
    expect(json.id).toBe("CUSTOM-ID");
  });

  it("handles normalizePlayerAddress returning null on exception", async () => {
    mockNormalizeSuiAddress.mockImplementation(() => {
      throw new Error("bad");
    });
    const res = await POST(makePostRequest(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_address");
  });

  it("handles empty address string", async () => {
    mockNormalizeSuiAddress.mockReturnValue("");
    mockIsValidSuiAddress.mockReturnValue(false);
    const res = await POST(makePostRequest({ ...validBody, address: "  " }));
    expect(res.status).toBe(400);
  });
});
