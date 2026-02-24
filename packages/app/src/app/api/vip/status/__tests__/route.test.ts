import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
  getMemberByAddress: vi.fn(),
  getMembershipTierById: vi.fn(),
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
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));
vi.mock("@/lib/admin/admin-store", () => ({
  getMemberByAddress: mocks.getMemberByAddress,
  getMembershipTierById: mocks.getMembershipTierById,
}));

import { GET } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

function makeReq(url: string) {
  return new Request(url);
}

describe("GET /api/vip/status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a.trim());
    mocks.isValidSuiAddress.mockReturnValue(true);
  });

  it("returns null member when no userAddress", async () => {
    mocks.normalizeSuiAddress.mockReturnValue("");
    const req = makeReq("http://localhost/api/vip/status");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.member).toBeNull();
    expect(body.tier).toBeNull();
  });

  it("returns 400 for invalid userAddress", async () => {
    mocks.isValidSuiAddress.mockReturnValue(false);
    const req = makeReq("http://localhost/api/vip/status?userAddress=bad");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq(`http://localhost/api/vip/status?userAddress=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns null member when not found", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getMemberByAddress.mockResolvedValue(null);
    const req = makeReq(`http://localhost/api/vip/status?userAddress=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.member).toBeNull();
  });

  it("returns member with tier", async () => {
    const member = { id: "M1", tierId: "T1", address: VALID_ADDRESS, status: "有效" };
    const tier = { id: "T1", name: "Gold", price: 100 };
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getMemberByAddress.mockResolvedValue(member);
    mocks.getMembershipTierById.mockResolvedValue(tier);
    const req = makeReq(`http://localhost/api/vip/status?userAddress=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.member).toEqual(member);
    expect(body.tier).toEqual(tier);
  });
});
