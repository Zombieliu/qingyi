import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  getClientIp: vi.fn(),
  parseBodyRaw: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
  createUserSession: vi.fn(),
  clearUserSessionCookie: vi.fn(),
  revokeUserSession: vi.fn(),
  getUserSessionFromToken: vi.fn(),
  getUserSessionFromTokenAllowExpired: vi.fn(),
  renewUserSessionExpiry: vi.fn(),
  requireUserSignature: vi.fn(),
  setUserSessionCookie: vi.fn(),
  cookies: vi.fn(),
  env: {
    AUTH_SESSION_RATE_LIMIT_MAX: 20,
    AUTH_SESSION_RATE_LIMIT_WINDOW_MS: 60000,
    USER_SESSION_TTL_HOURS: 168,
  },
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

vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/shared/api-utils", () => ({ getClientIp: mocks.getClientIp }));
vi.mock("@/lib/shared/api-validation", () => ({ parseBodyRaw: mocks.parseBodyRaw }));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));
vi.mock("@/lib/auth/user-auth", () => ({
  createUserSession: mocks.createUserSession,
  clearUserSessionCookie: mocks.clearUserSessionCookie,
  revokeUserSession: mocks.revokeUserSession,
  getUserSessionFromToken: mocks.getUserSessionFromToken,
  getUserSessionFromTokenAllowExpired: mocks.getUserSessionFromTokenAllowExpired,
  renewUserSessionExpiry: mocks.renewUserSessionExpiry,
  requireUserSignature: mocks.requireUserSignature,
  setUserSessionCookie: mocks.setUserSessionCookie,
}));
vi.mock("next/headers", () => ({ cookies: mocks.cookies }));

import { POST, GET, DELETE } from "../route";

function createMockRequest(url: string, options?: RequestInit) {
  return new Request(url, options);
}

const VALID_ADDRESS = "0x" + "a".repeat(64);

describe("POST /api/auth/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(true);
    mocks.getClientIp.mockReturnValue("127.0.0.1");
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
  });

  it("returns 429 when rate limited", async () => {
    mocks.rateLimit.mockResolvedValue(false);
    const req = createMockRequest("http://localhost/api/auth/session", {
      method: "POST",
      body: JSON.stringify({ address: VALID_ADDRESS }),
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
  });

  it("returns 400 for invalid JSON body", async () => {
    const mockResponse = { status: 400 };
    mocks.parseBodyRaw.mockResolvedValue({
      success: false,
      response: { status: 400, json: async () => ({ error: "Invalid JSON" }) },
    });
    const req = createMockRequest("http://localhost/api/auth/session", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid address", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: "bad" },
      rawBody: '{"address":"bad"}',
    });
    mocks.normalizeSuiAddress.mockReturnValue("bad");
    mocks.isValidSuiAddress.mockReturnValue(false);
    const req = createMockRequest("http://localhost/api/auth/session", {
      method: "POST",
      body: JSON.stringify({ address: "bad" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_address");
  });

  it("returns auth error when signature verification fails", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS },
      rawBody: JSON.stringify({ address: VALID_ADDRESS }),
    });
    mocks.requireUserSignature.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "invalid_signature" }) },
    });
    const req = createMockRequest("http://localhost/api/auth/session", {
      method: "POST",
      body: JSON.stringify({ address: VALID_ADDRESS }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("creates session and returns ok on success", async () => {
    const expiresAt = Date.now() + 3600000;
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS },
      rawBody: JSON.stringify({ address: VALID_ADDRESS }),
    });
    mocks.requireUserSignature.mockResolvedValue({ ok: true });
    mocks.createUserSession.mockResolvedValue({
      token: "tok_123",
      session: { address: VALID_ADDRESS, expiresAt },
    });
    const req = createMockRequest("http://localhost/api/auth/session", {
      method: "POST",
      body: JSON.stringify({ address: VALID_ADDRESS }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.address).toBe(VALID_ADDRESS);
    expect(body.expiresAt).toBe(expiresAt);
    expect(mocks.setUserSessionCookie).toHaveBeenCalledWith(res, "tok_123", expiresAt);
  });

  it("uses x-auth-address header when body address is missing", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: {},
      rawBody: "{}",
    });
    mocks.normalizeSuiAddress.mockReturnValue(VALID_ADDRESS);
    mocks.requireUserSignature.mockResolvedValue({ ok: true });
    mocks.createUserSession.mockResolvedValue({
      token: "tok_456",
      session: { address: VALID_ADDRESS, expiresAt: Date.now() + 3600000 },
    });
    const req = createMockRequest("http://localhost/api/auth/session", {
      method: "POST",
      headers: { "x-auth-address": VALID_ADDRESS },
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});

describe("GET /api/auth/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      get: (name: string) => (name === "user_session" ? { value: "tok_abc" } : undefined),
    });
  });

  it("returns 401 when no valid session", async () => {
    mocks.getUserSessionFromToken.mockResolvedValue(null);
    const req = createMockRequest("http://localhost/api/auth/session");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  it("returns session info when valid", async () => {
    const session = {
      address: VALID_ADDRESS,
      expiresAt: Date.now() + 7 * 24 * 3600000,
      lastSeenAt: Date.now(),
      tokenHash: "hash_abc",
    };
    mocks.getUserSessionFromToken.mockResolvedValue(session);
    const req = createMockRequest("http://localhost/api/auth/session");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.address).toBe(VALID_ADDRESS);
  });

  it("returns 401 for refresh when session missing", async () => {
    mocks.getUserSessionFromTokenAllowExpired.mockResolvedValue(null);
    const req = createMockRequest("http://localhost/api/auth/session?refresh=1");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("session_missing");
  });

  it("refreshes session successfully", async () => {
    const newExpiry = Date.now() + 7 * 24 * 3600000;
    mocks.getUserSessionFromTokenAllowExpired.mockResolvedValue({
      address: VALID_ADDRESS,
      tokenHash: "hash_abc",
    });
    mocks.renewUserSessionExpiry.mockResolvedValue(newExpiry);
    const req = createMockRequest("http://localhost/api/auth/session?refresh=1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.expiresAt).toBe(newExpiry);
  });

  it("returns 500 when refresh fails", async () => {
    mocks.getUserSessionFromTokenAllowExpired.mockResolvedValue({
      address: VALID_ADDRESS,
      tokenHash: "hash_abc",
    });
    mocks.renewUserSessionExpiry.mockRejectedValue(new Error("db error"));
    const req = createMockRequest("http://localhost/api/auth/session?refresh=1");
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("refresh_failed");
  });
});

describe("DELETE /api/auth/session", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes session and clears cookie when token exists", async () => {
    mocks.cookies.mockResolvedValue({
      get: (name: string) => (name === "user_session" ? { value: "tok_abc" } : undefined),
    });
    mocks.revokeUserSession.mockResolvedValue(undefined);
    const res = await DELETE();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mocks.revokeUserSession).toHaveBeenCalledWith("tok_abc");
    expect(mocks.clearUserSessionCookie).toHaveBeenCalled();
  });

  it("clears cookie even when no token", async () => {
    mocks.cookies.mockResolvedValue({
      get: () => undefined,
    });
    const res = await DELETE();
    expect(res.status).toBe(200);
    expect(mocks.revokeUserSession).not.toHaveBeenCalled();
    expect(mocks.clearUserSessionCookie).toHaveBeenCalled();
  });
});
