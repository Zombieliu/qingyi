import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  bindReferral: vi.fn(),
  requireUserAuth: vi.fn(),
  parseBody: vi.fn(),
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

vi.mock("@/lib/admin/admin-store", () => ({ bindReferral: mocks.bindReferral }));
vi.mock("@/lib/auth/user-auth", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("@/lib/shared/api-validation", () => ({ parseBody: mocks.parseBody }));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));

import { POST } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);
const INVITER_ADDRESS = "0x" + "0".repeat(56) + "b".repeat(8);

function createMockRequest(url: string, options?: RequestInit) {
  return new Request(url, options);
}

describe("POST /api/referral/bind", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
  });

  it("returns error for invalid body", async () => {
    mocks.parseBody.mockResolvedValue({
      success: false,
      response: { status: 400, json: async () => ({ error: "validation error" }) },
    });
    const req = createMockRequest("http://localhost/api/referral/bind", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid inviteeAddress", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { inviteeAddress: "bad", refCode: "abcdef12" },
    });
    mocks.normalizeSuiAddress.mockReturnValueOnce("bad");
    mocks.isValidSuiAddress.mockReturnValueOnce(false);
    const req = createMockRequest("http://localhost/api/referral/bind", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid inviteeAddress");
  });

  it("returns auth error when user auth fails", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { inviteeAddress: VALID_ADDRESS, refCode: "abcdef12" },
    });
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = createMockRequest("http://localhost/api/referral/bind", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 for cannot_self_refer", async () => {
    // Make inviter address equal to invitee address
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { inviteeAddress: VALID_ADDRESS, refCode: VALID_ADDRESS.slice(-8) },
    });
    // normalizeSuiAddress called for inviteeAddress first, then for inviterAddress
    mocks.normalizeSuiAddress
      .mockReturnValueOnce(VALID_ADDRESS) // inviteeAddress
      .mockReturnValueOnce(VALID_ADDRESS); // inviterAddress (same)
    const req = createMockRequest("http://localhost/api/referral/bind", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("cannot_self_refer");
  });

  it("binds referral successfully", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { inviteeAddress: VALID_ADDRESS, refCode: "bbbbbbbb" },
    });
    mocks.normalizeSuiAddress
      .mockReturnValueOnce(VALID_ADDRESS)
      .mockReturnValueOnce(INVITER_ADDRESS);
    mocks.bindReferral.mockResolvedValue({
      duplicated: false,
      referral: { inviterAddress: INVITER_ADDRESS, inviteeAddress: VALID_ADDRESS },
    });
    const req = createMockRequest("http://localhost/api/referral/bind", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.duplicated).toBe(false);
  });

  it("returns duplicated true when already bound", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { inviteeAddress: VALID_ADDRESS, refCode: "bbbbbbbb" },
    });
    mocks.normalizeSuiAddress
      .mockReturnValueOnce(VALID_ADDRESS)
      .mockReturnValueOnce(INVITER_ADDRESS);
    mocks.bindReferral.mockResolvedValue({ duplicated: true, referral: null });
    const req = createMockRequest("http://localhost/api/referral/bind", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.duplicated).toBe(true);
  });

  it("returns 500 when bindReferral throws", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { inviteeAddress: VALID_ADDRESS, refCode: "bbbbbbbb" },
    });
    mocks.normalizeSuiAddress
      .mockReturnValueOnce(VALID_ADDRESS)
      .mockReturnValueOnce(INVITER_ADDRESS);
    mocks.bindReferral.mockRejectedValue(new Error("db error"));
    const req = createMockRequest("http://localhost/api/referral/bind", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("db error");
  });

  it("returns 400 for invalid refCode that produces invalid address", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { inviteeAddress: VALID_ADDRESS, refCode: "bbbbbbbb" },
    });
    mocks.normalizeSuiAddress.mockReturnValueOnce(VALID_ADDRESS).mockReturnValueOnce("invalid");
    mocks.isValidSuiAddress
      .mockReturnValueOnce(true) // inviteeAddress valid
      .mockReturnValueOnce(false); // inviterAddress invalid
    const req = createMockRequest("http://localhost/api/referral/bind", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid refCode");
  });
});
