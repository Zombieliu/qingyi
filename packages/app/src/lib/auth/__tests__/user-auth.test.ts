import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const { mockCookieStore, mockSessionStore, mockConsumeNonce, mockVerify } = vi.hoisted(() => ({
  mockCookieStore: { get: vi.fn() },
  mockSessionStore: {
    createUserSession: vi.fn(),
    getUserSessionByHash: vi.fn(),
    removeUserSessionByHash: vi.fn(),
    updateUserSessionByHash: vi.fn(),
  },
  mockConsumeNonce: vi.fn(),
  mockVerify: vi.fn(),
}));

vi.mock("@/lib/env", () => ({
  env: {
    AUTH_MAX_SKEW_MS: 60000,
    AUTH_NONCE_TTL_MS: 300000,
    USER_SESSION_TTL_HOURS: 168,
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200,
      cookies: { set: vi.fn() },
      headers: new Map(),
    }),
  },
}));

vi.mock("../user-session-store", () => mockSessionStore);

vi.mock("../../rate-limit", () => ({ consumeNonce: mockConsumeNonce }));

vi.mock("@mysten/sui/verify", () => ({
  verifyPersonalMessageSignature: mockVerify,
}));

vi.mock("@mysten/sui/utils", () => ({
  normalizeSuiAddress: (addr: string) => {
    if (!addr) return "0x" + "0".repeat(64);
    if (addr.startsWith("0x") && addr.length === 66) return addr.toLowerCase();
    // Short addresses without 0x prefix are treated as invalid (not padded)
    if (!addr.startsWith("0x")) return addr;
    return "0x" + addr.replace(/^0x/, "").padStart(64, "0").toLowerCase();
  },
  isValidSuiAddress: (addr: string) =>
    typeof addr === "string" && addr.startsWith("0x") && addr.length === 66,
}));

vi.mock("../auth-message", () => ({
  buildAuthMessage: vi.fn(
    (p: { intent: string; address: string; timestamp: number; nonce: string; bodyHash?: string }) =>
      `qy-auth-v2|${p.intent}|${p.address}|${p.timestamp}|${p.nonce}|${p.bodyHash || ""}`
  ),
}));

import {
  getUserSessionFromToken,
  createUserSession,
  revokeUserSession,
  requireUserSignature,
  requireUserAuth,
} from "../user-auth";

const VALID_ADDR = "0x" + "a".repeat(64);

function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hashBody(body: string) {
  return crypto.createHash("sha256").update(body).digest("base64");
}

function makeRequest(headers: Record<string, string> = {}, method = "POST"): Request {
  return { headers: new Headers(headers), method } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getUserSessionFromToken", () => {
  it("returns null for empty token", async () => {
    expect(await getUserSessionFromToken("")).toBeNull();
  });

  it("returns null when session not found", async () => {
    mockSessionStore.getUserSessionByHash.mockResolvedValue(null);
    expect(await getUserSessionFromToken("some-token")).toBeNull();
  });

  it("removes expired session and returns null", async () => {
    mockSessionStore.getUserSessionByHash.mockResolvedValue({
      tokenHash: "h",
      expiresAt: Date.now() - 1000,
    });
    mockSessionStore.removeUserSessionByHash.mockResolvedValue(true);
    expect(await getUserSessionFromToken("tok")).toBeNull();
    expect(mockSessionStore.removeUserSessionByHash).toHaveBeenCalled();
  });

  it("returns valid session and updates lastSeenAt", async () => {
    const session = { tokenHash: "h", expiresAt: Date.now() + 100000, address: VALID_ADDR };
    mockSessionStore.getUserSessionByHash.mockResolvedValue(session);
    mockSessionStore.updateUserSessionByHash.mockResolvedValue(undefined);
    const result = await getUserSessionFromToken("tok");
    expect(result).toBe(session);
    expect(mockSessionStore.updateUserSessionByHash).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ lastSeenAt: expect.any(Number) })
    );
  });
});

describe("createUserSession", () => {
  it("creates session with correct fields", async () => {
    mockSessionStore.createUserSession.mockResolvedValue(undefined);
    const result = await createUserSession({ address: VALID_ADDR, ip: "1.2.3.4" });
    expect(result.token).toBeTruthy();
    expect(result.token.length).toBe(64);
    expect(result.session.address).toBe(VALID_ADDR);
    expect(result.session.tokenHash).toBe(hashToken(result.token));
    expect(result.session.expiresAt).toBeGreaterThan(Date.now());
    expect(result.session.ip).toBe("1.2.3.4");
  });
});

describe("revokeUserSession", () => {
  it("returns false for empty token", async () => {
    expect(await revokeUserSession("")).toBe(false);
  });

  it("calls removeUserSessionByHash with hashed token", async () => {
    mockSessionStore.removeUserSessionByHash.mockResolvedValue(true);
    expect(await revokeUserSession("my-token")).toBe(true);
    expect(mockSessionStore.removeUserSessionByHash).toHaveBeenCalledWith(hashToken("my-token"));
  });
});

describe("requireUserSignature", () => {
  it("returns 401 when signature headers missing", async () => {
    const result = await requireUserSignature(makeRequest({}), {
      intent: "test",
      address: VALID_ADDR,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.body).toEqual({ error: "auth_required" });
  });

  it("returns 400 for invalid timestamp", async () => {
    const req = makeRequest({
      "x-auth-signature": "sig",
      "x-auth-timestamp": "NaN",
      "x-auth-nonce": "n",
    });
    const result = await requireUserSignature(req, { intent: "test", address: VALID_ADDR });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.body).toEqual({ error: "invalid_timestamp" });
  });

  it("returns 401 for expired timestamp", async () => {
    const req = makeRequest({
      "x-auth-signature": "sig",
      "x-auth-timestamp": String(Date.now() - 120000),
      "x-auth-nonce": "n",
    });
    const result = await requireUserSignature(req, { intent: "test", address: VALID_ADDR });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.body).toEqual({ error: "auth_expired" });
  });

  it("returns 400 for invalid address", async () => {
    const req = makeRequest({
      "x-auth-signature": "sig",
      "x-auth-timestamp": String(Date.now()),
      "x-auth-nonce": "n",
    });
    const result = await requireUserSignature(req, { intent: "test", address: "bad" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.body).toEqual({ error: "invalid_address" });
  });

  it("returns 401 for address mismatch in header", async () => {
    const other = "0x" + "b".repeat(64);
    const req = makeRequest({
      "x-auth-signature": "sig",
      "x-auth-timestamp": String(Date.now()),
      "x-auth-nonce": "n",
      "x-auth-address": other,
    });
    mockConsumeNonce.mockResolvedValue(true);
    const result = await requireUserSignature(req, { intent: "test", address: VALID_ADDR });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.body).toEqual({ error: "address_mismatch" });
  });

  it("returns 401 for replay (nonce consumed)", async () => {
    const req = makeRequest({
      "x-auth-signature": "sig",
      "x-auth-timestamp": String(Date.now()),
      "x-auth-nonce": "n",
    });
    mockConsumeNonce.mockResolvedValue(false);
    const result = await requireUserSignature(req, { intent: "test", address: VALID_ADDR });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.body).toEqual({ error: "replay_detected" });
  });

  it("returns 401 when body provided but no body hash header", async () => {
    const req = makeRequest({
      "x-auth-signature": "sig",
      "x-auth-timestamp": String(Date.now()),
      "x-auth-nonce": "n",
    });
    mockConsumeNonce.mockResolvedValue(true);
    const result = await requireUserSignature(req, {
      intent: "test",
      address: VALID_ADDR,
      body: "{}",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.body).toEqual({ error: "body_hash_required" });
  });

  it("returns 401 for body hash mismatch", async () => {
    const req = makeRequest({
      "x-auth-signature": "sig",
      "x-auth-timestamp": String(Date.now()),
      "x-auth-nonce": "n",
      "x-auth-body-sha256": "wrong",
    });
    mockConsumeNonce.mockResolvedValue(true);
    const result = await requireUserSignature(req, {
      intent: "test",
      address: VALID_ADDR,
      body: "{}",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.body).toEqual({ error: "body_hash_mismatch" });
  });

  it("returns ok when signature verifies (no body)", async () => {
    const req = makeRequest({
      "x-auth-signature": "sig",
      "x-auth-timestamp": String(Date.now()),
      "x-auth-nonce": "n",
    });
    mockConsumeNonce.mockResolvedValue(true);
    mockVerify.mockResolvedValue(undefined);
    const result = await requireUserSignature(req, { intent: "test", address: VALID_ADDR });
    expect(result.ok).toBe(true);
  });

  it("returns ok when signature verifies (with body)", async () => {
    const body = '{"data":1}';
    const bh = hashBody(body);
    const req = makeRequest({
      "x-auth-signature": "sig",
      "x-auth-timestamp": String(Date.now()),
      "x-auth-nonce": "n",
      "x-auth-body-sha256": bh,
    });
    mockConsumeNonce.mockResolvedValue(true);
    mockVerify.mockResolvedValue(undefined);
    const result = await requireUserSignature(req, { intent: "test", address: VALID_ADDR, body });
    expect(result.ok).toBe(true);
  });

  it("returns 401 when crypto verify throws", async () => {
    const req = makeRequest({
      "x-auth-signature": "bad",
      "x-auth-timestamp": String(Date.now()),
      "x-auth-nonce": "n",
    });
    mockConsumeNonce.mockResolvedValue(true);
    mockVerify.mockRejectedValue(new Error("bad sig"));
    const result = await requireUserSignature(req, { intent: "test", address: VALID_ADDR });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.body).toEqual({ error: "invalid_signature" });
  });
});

describe("requireUserAuth", () => {
  it("authenticates via bearer token", async () => {
    const session = { tokenHash: "h", address: VALID_ADDR, expiresAt: Date.now() + 100000 };
    mockSessionStore.getUserSessionByHash.mockResolvedValue(session);
    mockSessionStore.updateUserSessionByHash.mockResolvedValue(undefined);
    const req = makeRequest({ authorization: "Bearer my-token" });
    const result = await requireUserAuth(req, { intent: "test", address: VALID_ADDR });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.authType).toBe("token");
  });

  it("returns 401 for invalid bearer token", async () => {
    mockSessionStore.getUserSessionByHash.mockResolvedValue(null);
    const req = makeRequest({ authorization: "Bearer bad" });
    const result = await requireUserAuth(req, { intent: "test", address: VALID_ADDR });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.body).toEqual({ error: "invalid_token" });
  });

  it("authenticates via cookie session", async () => {
    const session = { tokenHash: "h", address: VALID_ADDR, expiresAt: Date.now() + 100000 };
    mockCookieStore.get.mockReturnValue({ value: "cookie-token" });
    mockSessionStore.getUserSessionByHash.mockResolvedValue(session);
    mockSessionStore.updateUserSessionByHash.mockResolvedValue(undefined);
    const req = makeRequest({ origin: "https://example.com", host: "example.com" });
    const result = await requireUserAuth(req, { intent: "test", address: VALID_ADDR });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.authType).toBe("session");
  });

  it("returns 403 for origin mismatch on POST with cookie session", async () => {
    const session = { tokenHash: "h", address: VALID_ADDR, expiresAt: Date.now() + 100000 };
    mockCookieStore.get.mockReturnValue({ value: "cookie-token" });
    mockSessionStore.getUserSessionByHash.mockResolvedValue(session);
    mockSessionStore.updateUserSessionByHash.mockResolvedValue(undefined);
    const req = makeRequest({ origin: "https://evil.com", host: "example.com" });
    const result = await requireUserAuth(req, { intent: "test", address: VALID_ADDR });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.body).toEqual({ error: "origin_mismatch" });
  });

  it("falls back to signature when no session", async () => {
    mockCookieStore.get.mockReturnValue(undefined);
    mockSessionStore.getUserSessionByHash.mockResolvedValue(null);
    const req = makeRequest({
      "x-auth-signature": "sig",
      "x-auth-timestamp": String(Date.now()),
      "x-auth-nonce": "n",
    });
    mockConsumeNonce.mockResolvedValue(true);
    mockVerify.mockResolvedValue(undefined);
    const result = await requireUserAuth(req, { intent: "test", address: VALID_ADDR });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.authType).toBe("signature");
  });

  it("revokes cookie session on address mismatch and falls back", async () => {
    const other = "0x" + "b".repeat(64);
    mockCookieStore.get.mockReturnValue({ value: "cookie-token" });
    mockSessionStore.getUserSessionByHash.mockResolvedValue({
      tokenHash: "h",
      address: other,
      expiresAt: Date.now() + 100000,
    });
    mockSessionStore.updateUserSessionByHash.mockResolvedValue(undefined);
    mockSessionStore.removeUserSessionByHash.mockResolvedValue(true);
    const req = makeRequest({});
    const result = await requireUserAuth(req, { intent: "test", address: VALID_ADDR });
    expect(result.ok).toBe(false);
    expect(mockSessionStore.removeUserSessionByHash).toHaveBeenCalled();
  });
});

describe("requireUserAuth edge cases", () => {
  it("returns 400 for invalid address with bearer token", async () => {
    const session = { tokenHash: "h", address: VALID_ADDR, expiresAt: Date.now() + 100000 };
    mockSessionStore.getUserSessionByHash.mockResolvedValue(session);
    mockSessionStore.updateUserSessionByHash.mockResolvedValue(undefined);
    const req = makeRequest({ authorization: "Bearer my-token" });
    const result = await requireUserAuth(req, { intent: "test", address: "invalid" });
    expect(result.ok).toBe(false);
  });

  it("returns 401 for bearer token address mismatch", async () => {
    const other = "0x" + "b".repeat(64);
    const session = { tokenHash: "h", address: VALID_ADDR, expiresAt: Date.now() + 100000 };
    mockSessionStore.getUserSessionByHash.mockResolvedValue(session);
    mockSessionStore.updateUserSessionByHash.mockResolvedValue(undefined);
    mockSessionStore.removeUserSessionByHash.mockResolvedValue(true);
    const req = makeRequest({ authorization: "Bearer my-token" });
    const result = await requireUserAuth(req, { intent: "test", address: other });
    expect(result.ok).toBe(false);
  });

  it("returns 400 for invalid address with cookie session", async () => {
    mockCookieStore.get.mockReturnValue({ value: "cookie-token" });
    const session = { tokenHash: "h", address: VALID_ADDR, expiresAt: Date.now() + 100000 };
    mockSessionStore.getUserSessionByHash.mockResolvedValue(session);
    mockSessionStore.updateUserSessionByHash.mockResolvedValue(undefined);
    const req = makeRequest({ origin: "https://example.com", host: "example.com" });
    const result = await requireUserAuth(req, { intent: "test", address: "bad" });
    expect(result.ok).toBe(false);
  });
});

describe("setUserSessionCookie", () => {
  it("sets cookie on response", async () => {
    const { setUserSessionCookie } = await import("../user-auth");
    const res = { cookies: { set: vi.fn() } } as unknown as import("next/server").NextResponse;
    setUserSessionCookie(res, "token123", Date.now() + 86400_000);
    expect(res.cookies.set).toHaveBeenCalledWith(
      expect.objectContaining({ name: "user_session", value: "token123" })
    );
  });
});

describe("clearUserSessionCookie", () => {
  it("clears cookie on response", async () => {
    const { clearUserSessionCookie } = await import("../user-auth");
    const res = { cookies: { set: vi.fn() } } as unknown as import("next/server").NextResponse;
    clearUserSessionCookie(res);
    expect(res.cookies.set).toHaveBeenCalledWith(
      expect.objectContaining({ name: "user_session", value: "" })
    );
  });
});

describe("getUserSessionFromToken expired", () => {
  it("removes expired session and returns null", async () => {
    mockSessionStore.getUserSessionByHash.mockResolvedValue({
      tokenHash: "h",
      address: VALID_ADDR,
      expiresAt: Date.now() - 1000, // expired
    });
    mockSessionStore.removeUserSessionByHash.mockResolvedValue(true);
    const { getUserSessionFromToken } = await import("../user-auth");
    const result = await getUserSessionFromToken("expired-token");
    expect(result).toBeNull();
    expect(mockSessionStore.removeUserSessionByHash).toHaveBeenCalled();
  });
});
