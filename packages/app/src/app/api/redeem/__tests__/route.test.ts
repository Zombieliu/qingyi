import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  redeemCodeForUser: vi.fn(),
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
vi.mock("@/lib/redeem/redeem-service", () => ({ redeemCodeForUser: mocks.redeemCodeForUser }));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));
vi.mock("@/lib/shared/api-validation", () => ({ parseBodyRaw: mocks.parseBodyRaw }));

import { POST } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

function makeReq(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("POST /api/redeem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
  });
  it("returns validation error for invalid body", async () => {
    const errResp = { status: 400, json: async () => ({ error: "Invalid" }) };
    mocks.parseBodyRaw.mockResolvedValue({ success: false, response: errResp });
    const req = makeReq("http://localhost/api/redeem", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid address", async () => {
    mocks.isValidSuiAddress.mockReturnValue(false);
    mocks.normalizeSuiAddress.mockReturnValue("");
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: "bad", code: "CODE1" },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/redeem", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid address");
  });

  it("returns auth error when user auth fails", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, code: "CODE1" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq("http://localhost/api/redeem", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("redeems code successfully", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, code: "CODE1" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.redeemCodeForUser.mockResolvedValue({ ok: true, reward: 100 });
    const req = makeReq("http://localhost/api/redeem", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns error when redeem fails", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, code: "EXPIRED" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.redeemCodeForUser.mockResolvedValue({ ok: false, error: "code_expired", status: 400 });
    const req = makeReq("http://localhost/api/redeem", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("code_expired");
  });

  it("passes x-forwarded-for IP to redeemCodeForUser", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, code: "CODE1" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.redeemCodeForUser.mockResolvedValue({ ok: true, reward: 100 });
    const req = makeReq("http://localhost/api/redeem", {
      method: "POST",
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    await POST(req);
    expect(mocks.redeemCodeForUser).toHaveBeenCalledWith(
      expect.objectContaining({ ip: "1.2.3.4" })
    );
  });

  it("passes x-real-ip when x-forwarded-for is missing", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, code: "CODE1" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.redeemCodeForUser.mockResolvedValue({ ok: true, reward: 100 });
    const req = makeReq("http://localhost/api/redeem", {
      method: "POST",
      headers: { "x-real-ip": "9.8.7.6" },
    });
    await POST(req);
    expect(mocks.redeemCodeForUser).toHaveBeenCalledWith(
      expect.objectContaining({ ip: "9.8.7.6" })
    );
  });
});
