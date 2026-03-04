import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getPlayerByAddressEdgeRead: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
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

vi.mock("@/lib/edge-db/player-status-store", () => ({
  getPlayerByAddressEdgeRead: mocks.getPlayerByAddressEdgeRead,
}));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));

import { GET } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

describe("GET /api/guardians/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
  });

  it("returns 400 when address is missing", async () => {
    const req = new Request("http://localhost/api/guardians/status");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid address", async () => {
    mocks.isValidSuiAddress.mockReturnValue(false);
    const req = new Request("http://localhost/api/guardians/status?address=bad");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns isGuardian true for active player", async () => {
    mocks.getPlayerByAddressEdgeRead.mockResolvedValue({
      player: { id: "P-1", status: "可接单" },
      conflict: false,
    });
    const req = new Request(`http://localhost/api/guardians/status?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isGuardian).toBe(true);
  });

  it("returns isGuardian false for disabled player", async () => {
    mocks.getPlayerByAddressEdgeRead.mockResolvedValue({
      player: { id: "P-1", status: "停用" },
      conflict: false,
    });
    const req = new Request(`http://localhost/api/guardians/status?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isGuardian).toBe(false);
  });

  it("returns isGuardian false when player not found", async () => {
    mocks.getPlayerByAddressEdgeRead.mockResolvedValue({ player: null, conflict: false });
    const req = new Request(`http://localhost/api/guardians/status?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isGuardian).toBe(false);
  });

  it("returns isGuardian false when address has conflict", async () => {
    mocks.getPlayerByAddressEdgeRead.mockResolvedValue({ player: null, conflict: true });
    const req = new Request(`http://localhost/api/guardians/status?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.isGuardian).toBe(false);
  });
});
