import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  createUserSession: vi.fn(),
  getUserSessionFromToken: vi.fn(),
  requireUserSignature: vi.fn(),
  getClientIp: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
  parseBodyRaw: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  upsert: vi.fn(),
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

vi.mock("@/lib/db", () => ({
  prisma: {
    miniProgramAccount: {
      findUnique: mocks.findUnique,
      update: mocks.update,
      upsert: mocks.upsert,
    },
  },
}));
vi.mock("@/lib/auth/user-auth", () => ({
  createUserSession: mocks.createUserSession,
  getUserSessionFromToken: mocks.getUserSessionFromToken,
  requireUserSignature: mocks.requireUserSignature,
}));
vi.mock("@/lib/shared/api-utils", () => ({ getClientIp: mocks.getClientIp }));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));
vi.mock("@/lib/shared/api-validation", () => ({ parseBodyRaw: mocks.parseBodyRaw }));

import { POST } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

describe("POST /api/auth/mini", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
    mocks.getClientIp.mockReturnValue("127.0.0.1");
  });

  it("returns validation error for invalid body", async () => {
    const errResp = { status: 400, json: async () => ({ error: "Invalid" }) };
    mocks.parseBodyRaw.mockResolvedValue({ success: false, response: errResp });
    const req = new Request("http://localhost/api/auth/mini", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns session for existing bound account", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { platform: "wechat", code: "test-code" },
      rawBody: "{}",
    });
    mocks.findUnique.mockResolvedValue({
      userAddress: VALID_ADDRESS,
      openid: "mock_openid",
      unionid: "mock_unionid",
    });
    mocks.update.mockResolvedValue({
      openid: "mock_openid",
      unionid: "mock_unionid",
      userAddress: VALID_ADDRESS,
    });
    mocks.createUserSession.mockResolvedValue({
      token: "tok_123",
      session: { expiresAt: Date.now() + 86400000 },
    });
    const req = new Request("http://localhost/api/auth/mini", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.token).toBe("tok_123");
  });

  it("returns 409 when address mismatch on existing account", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { platform: "wechat", code: "test-code", address: "0xdifferent" },
      rawBody: "{}",
    });
    mocks.findUnique.mockResolvedValue({
      userAddress: VALID_ADDRESS,
      openid: "mock_openid",
    });
    const req = new Request("http://localhost/api/auth/mini", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("address_mismatch");
  });

  it("returns 409 binding_required when no address and no session", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { platform: "wechat", code: "test-code" },
      rawBody: "{}",
    });
    mocks.findUnique.mockResolvedValue(null);
    mocks.getUserSessionFromToken.mockResolvedValue(null);
    const req = new Request("http://localhost/api/auth/mini", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("binding_required");
  });

  it("binds new account with provided address", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { platform: "wechat", code: "test-code", address: VALID_ADDRESS },
      rawBody: "{}",
    });
    mocks.findUnique.mockResolvedValue(null);
    mocks.upsert.mockResolvedValue({
      openid: "mock_openid",
      unionid: "mock_unionid",
      userAddress: VALID_ADDRESS,
    });
    mocks.createUserSession.mockResolvedValue({
      token: "tok_new",
      session: { expiresAt: Date.now() + 86400000 },
    });
    const req = new Request("http://localhost/api/auth/mini", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.address).toBe(VALID_ADDRESS);
  });

  it("returns 400 for invalid address", async () => {
    mocks.isValidSuiAddress.mockReturnValue(false);
    mocks.normalizeSuiAddress.mockReturnValue("");
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { platform: "wechat", code: "test-code", address: "bad" },
      rawBody: "{}",
    });
    mocks.findUnique.mockResolvedValue(null);
    const req = new Request("http://localhost/api/auth/mini", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_address");
  });

  it("returns 409 when bearer session address mismatches bind address", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { platform: "wechat", code: "test-code", address: VALID_ADDRESS },
      rawBody: "{}",
    });
    mocks.findUnique.mockResolvedValue(null);
    mocks.getUserSessionFromToken.mockResolvedValue({ address: "0xdifferent_bearer" });
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    const req = new Request("http://localhost/api/auth/mini", {
      method: "POST",
      headers: { Authorization: "Bearer tok_session" },
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("address_mismatch");
  });

  it("requires signature in production when no bearer session", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { platform: "wechat", code: "test-code", address: VALID_ADDRESS },
      rawBody: '{"test":true}',
    });
    mocks.findUnique.mockResolvedValue(null);
    mocks.getUserSessionFromToken.mockResolvedValue(null);
    mocks.requireUserSignature.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "signature_required" }) },
    });
    const req = new Request("http://localhost/api/auth/mini", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(mocks.requireUserSignature).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        intent: expect.stringContaining("mini:bind:wechat:mock_wechat_openid_"),
      })
    );
    process.env.NODE_ENV = origEnv;
  });

  it("passes signature check in production and binds account", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { platform: "wechat", code: "test-code", address: VALID_ADDRESS },
      rawBody: '{"test":true}',
    });
    mocks.findUnique.mockResolvedValue(null);
    mocks.getUserSessionFromToken.mockResolvedValue(null);
    mocks.requireUserSignature.mockResolvedValue({ ok: true });
    mocks.upsert.mockResolvedValue({
      openid: "mock_openid",
      unionid: "mock_unionid",
      userAddress: VALID_ADDRESS,
    });
    mocks.createUserSession.mockResolvedValue({
      token: "tok_prod",
      session: { expiresAt: Date.now() + 86400000 },
    });
    const req = new Request("http://localhost/api/auth/mini", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    process.env.NODE_ENV = origEnv;
  });

  it("uses bearer session address when no address provided", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { platform: "wechat", code: "test-code" },
      rawBody: "{}",
    });
    mocks.findUnique.mockResolvedValue(null);
    mocks.getUserSessionFromToken.mockResolvedValue({ address: VALID_ADDRESS });
    mocks.upsert.mockResolvedValue({
      openid: "mock_openid",
      unionid: "mock_unionid",
      userAddress: VALID_ADDRESS,
    });
    mocks.createUserSession.mockResolvedValue({
      token: "tok_bearer",
      session: { expiresAt: Date.now() + 86400000 },
    });
    const req = new Request("http://localhost/api/auth/mini", {
      method: "POST",
      headers: { Authorization: "Bearer tok_session" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
