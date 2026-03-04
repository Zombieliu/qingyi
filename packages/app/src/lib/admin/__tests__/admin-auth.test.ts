import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

const {
  mockCookieStore,
  mockCreateSession,
  mockGetSessionByHash,
  mockRemoveSessionByHash,
  mockUpdateSessionByHash,
  mockGetAccessTokenByHash,
  mockTouchAccessTokenByHash,
  mockRateLimit,
  mockIsIpAllowed,
  mockNormalizeClientIp,
} = vi.hoisted(() => ({
  mockCookieStore: { get: vi.fn() },
  mockCreateSession: vi.fn(),
  mockGetSessionByHash: vi.fn(),
  mockRemoveSessionByHash: vi.fn(),
  mockUpdateSessionByHash: vi.fn(),
  mockGetAccessTokenByHash: vi.fn(),
  mockTouchAccessTokenByHash: vi.fn(),
  mockRateLimit: vi.fn(),
  mockIsIpAllowed: vi.fn(),
  mockNormalizeClientIp: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/env", () => ({
  env: {
    ADMIN_SESSION_TTL_HOURS: 24,
    ADMIN_RATE_LIMIT_WINDOW_MS: 60000,
    ADMIN_RATE_LIMIT_MAX: 60,
    ADMIN_LOGIN_RATE_LIMIT_MAX: 10,
    ADMIN_IP_ALLOWLIST: "",
    ADMIN_REQUIRE_SESSION: "0",
    ADMIN_TOKENS_JSON: undefined,
    ADMIN_TOKENS: undefined,
    ADMIN_DASH_TOKEN: "test-admin-token",
    LEDGER_ADMIN_TOKEN: undefined,
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
    }),
  },
}));

vi.mock("../session-store-edge", () => ({
  createSession: mockCreateSession,
  getSessionByHash: mockGetSessionByHash,
  removeSessionByHash: mockRemoveSessionByHash,
  updateSessionByHash: mockUpdateSessionByHash,
  getAccessTokenByHash: mockGetAccessTokenByHash,
  touchAccessTokenByHash: mockTouchAccessTokenByHash,
}));

vi.mock("../../rate-limit", () => ({
  rateLimit: mockRateLimit,
}));

vi.mock("../admin-ip-utils", () => ({
  isIpAllowed: mockIsIpAllowed,
  normalizeClientIp: mockNormalizeClientIp,
}));

import {
  requireAdmin,
  createAdminSession,
  rotateAdminSession,
  revokeAdminSession,
  getAdminSession,
  enforceAdminIpAllowlist,
  ensureSameOrigin,
  enforceLoginRateLimit,
  getAdminRoleForToken,
  getAdminTokensSummary,
} from "../admin-auth";

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function makeRequest(headers: Record<string, string> = {}, method = "GET"): Request {
  return {
    headers: new Headers(headers),
    method,
  } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRateLimit.mockResolvedValue(true);
  mockIsIpAllowed.mockReturnValue(true);
  mockNormalizeClientIp.mockImplementation((ip: string) => ip);
  mockCookieStore.get.mockReturnValue(undefined);
  mockGetSessionByHash.mockResolvedValue(null);
  mockGetAccessTokenByHash.mockResolvedValue(null);
});

describe("requireAdmin", () => {
  it("returns 429 when rate limited", async () => {
    mockRateLimit.mockResolvedValue(false);
    const req = makeRequest({});
    const result = await requireAdmin(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.body).toEqual({ error: "rate_limited" });
      expect(result.response.status).toBe(429);
    }
  });

  it("returns 403 for invalid origin on POST", async () => {
    const req = makeRequest({ origin: "https://evil.com", host: "example.com" }, "POST");
    const result = await requireAdmin(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.body).toEqual({ error: "invalid_origin" });
      expect(result.response.status).toBe(403);
    }
  });

  it("authenticates via session cookie", async () => {
    const sessionToken = "valid-session-token";
    const sessionHash = hashToken(sessionToken);
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "admin_session") return { value: sessionToken };
      return undefined;
    });
    mockGetSessionByHash.mockImplementation(async (hash: string) => {
      if (hash === sessionHash) {
        return {
          id: "sess_1",
          tokenHash: sessionHash,
          role: "admin",
          expiresAt: Date.now() + 86400000,
          createdAt: Date.now(),
        };
      }
      return null;
    });
    mockUpdateSessionByHash.mockResolvedValue(undefined);

    const req = makeRequest({});
    const result = await requireAdmin(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("admin");
      expect(result.authType).toBe("session");
      expect(result.sessionId).toBe("sess_1");
    }
  });

  it("rejects expired session", async () => {
    const sessionToken = "expired-session-token";
    const sessionHash = hashToken(sessionToken);
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "admin_session") return { value: sessionToken };
      return undefined;
    });
    mockGetSessionByHash.mockImplementation(async (hash: string) => {
      if (hash === sessionHash) {
        return {
          id: "sess_expired",
          tokenHash: sessionHash,
          role: "admin",
          expiresAt: Date.now() - 1000,
          createdAt: Date.now() - 86400000,
        };
      }
      return null;
    });
    mockRemoveSessionByHash.mockResolvedValue(true);

    const req = makeRequest({});
    const result = await requireAdmin(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.body).toEqual({ error: "unauthorized" });
      expect(result.response.status).toBe(401);
    }
    expect(mockRemoveSessionByHash).toHaveBeenCalledWith(sessionHash);
  });

  it("checks role rank and returns 403 for insufficient role", async () => {
    const sessionToken = "viewer-session-token";
    const sessionHash = hashToken(sessionToken);
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "admin_session") return { value: sessionToken };
      return undefined;
    });
    mockGetSessionByHash.mockImplementation(async (hash: string) => {
      if (hash === sessionHash) {
        return {
          id: "sess_viewer",
          tokenHash: sessionHash,
          role: "viewer",
          expiresAt: Date.now() + 86400000,
          createdAt: Date.now(),
        };
      }
      return null;
    });
    mockUpdateSessionByHash.mockResolvedValue(undefined);

    const req = makeRequest({});
    const result = await requireAdmin(req, { role: "admin" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.body).toEqual({ error: "forbidden" });
      expect(result.response.status).toBe(403);
    }
  });

  it("authenticates via legacy cookie", async () => {
    // No session cookie
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "admin_token") return { value: "test-admin-token" };
      return undefined;
    });

    const req = makeRequest({});
    const result = await requireAdmin(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("admin");
      expect(result.authType).toBe("legacy");
    }
  });

  it("authenticates via Bearer token", async () => {
    const req = makeRequest({ authorization: "Bearer test-admin-token" });
    const result = await requireAdmin(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("admin");
      expect(result.authType).toBe("token");
    }
  });

  it("authenticates via x-admin-token header", async () => {
    const req = makeRequest({ "x-admin-token": "test-admin-token" });
    const result = await requireAdmin(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("admin");
      expect(result.authType).toBe("token");
    }
  });

  it("authenticates via legacy cookie with DB token and touches it", async () => {
    const dbToken = "db-legacy-token";
    const dbTokenHash = hashToken(dbToken);
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "admin_token") return { value: dbToken };
      return undefined;
    });
    mockGetAccessTokenByHash.mockImplementation(async (hash: string) => {
      if (hash === dbTokenHash) {
        return {
          id: "tok_legacy",
          tokenHash: dbTokenHash,
          tokenPrefix: "db-le",
          role: "ops",
          label: "Legacy DB Token",
          status: "active",
          createdAt: Date.now(),
        };
      }
      return null;
    });
    mockTouchAccessTokenByHash.mockResolvedValue(true);

    const req = makeRequest({});
    const result = await requireAdmin(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("ops");
      expect(result.authType).toBe("legacy");
    }
    expect(mockTouchAccessTokenByHash).toHaveBeenCalledWith(dbTokenHash);
  });

  it("authenticates via x-admin-token header with DB token and touches it", async () => {
    const dbToken = "db-header-token";
    const dbTokenHash = hashToken(dbToken);
    mockGetAccessTokenByHash.mockImplementation(async (hash: string) => {
      if (hash === dbTokenHash) {
        return {
          id: "tok_header",
          tokenHash: dbTokenHash,
          tokenPrefix: "db-he",
          role: "admin",
          label: "Header DB Token",
          status: "active",
          createdAt: Date.now(),
        };
      }
      return null;
    });
    mockTouchAccessTokenByHash.mockResolvedValue(true);

    const req = makeRequest({ "x-admin-token": dbToken });
    const result = await requireAdmin(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("admin");
      expect(result.authType).toBe("token");
    }
    expect(mockTouchAccessTokenByHash).toHaveBeenCalledWith(dbTokenHash);
  });

  it("returns 401 when no auth provided", async () => {
    const req = makeRequest({});
    const result = await requireAdmin(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.body).toEqual({ error: "unauthorized" });
      expect(result.response.status).toBe(401);
    }
  });

  it("uses x-real-ip when x-forwarded-for is absent", async () => {
    mockRateLimit.mockResolvedValue(true);
    const req = makeRequest({ "x-real-ip": "10.0.0.1" });
    await requireAdmin(req);
    // The rate limit key should include the IP from x-real-ip
    expect(mockRateLimit).toHaveBeenCalledWith(
      expect.stringContaining("admin:"),
      expect.any(Number),
      expect.any(Number)
    );
    expect(mockNormalizeClientIp).toHaveBeenCalledWith("10.0.0.1");
  });

  it("returns 403 when IP is not in allowlist", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/env", () => ({
      env: {
        ADMIN_SESSION_TTL_HOURS: 24,
        ADMIN_RATE_LIMIT_WINDOW_MS: 60000,
        ADMIN_RATE_LIMIT_MAX: 60,
        ADMIN_LOGIN_RATE_LIMIT_MAX: 10,
        ADMIN_IP_ALLOWLIST: "192.168.1.0/24",
        ADMIN_REQUIRE_SESSION: "0",
        ADMIN_TOKENS_JSON: undefined,
        ADMIN_TOKENS: undefined,
        ADMIN_DASH_TOKEN: "test-admin-token",
        LEDGER_ADMIN_TOKEN: undefined,
      },
    }));
    vi.doMock("next/headers", () => ({
      cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
    }));
    vi.doMock("next/server", () => ({
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
          body,
          status: init?.status ?? 200,
        }),
      },
    }));
    vi.doMock("../session-store-edge", () => ({
      createSession: mockCreateSession,
      getSessionByHash: mockGetSessionByHash,
      removeSessionByHash: mockRemoveSessionByHash,
      updateSessionByHash: mockUpdateSessionByHash,
      getAccessTokenByHash: mockGetAccessTokenByHash,
      touchAccessTokenByHash: mockTouchAccessTokenByHash,
    }));
    vi.doMock("../../rate-limit", () => ({ rateLimit: mockRateLimit }));
    mockIsIpAllowed.mockReturnValue(false);
    vi.doMock("../admin-ip-utils", () => ({
      isIpAllowed: mockIsIpAllowed,
      normalizeClientIp: mockNormalizeClientIp,
    }));
    mockRateLimit.mockResolvedValue(true);
    mockNormalizeClientIp.mockImplementation((ip: string) => ip);

    const mod = await import("../admin-auth");
    const req = makeRequest({ "x-forwarded-for": "10.0.0.1" });
    const result = await mod.requireAdmin(req);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.body).toEqual({ error: "ip_forbidden" });
      expect(result.response.status).toBe(403);
    }
  });

  it("handles unknown role in roleRank (default branch)", async () => {
    // Test that a session with an unknown role gets rank 1 (default)
    // and can still authenticate for viewer-level access
    const sessionToken = "unknown-role-session";
    const sessionHash = hashToken(sessionToken);
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "admin_session") return { value: sessionToken };
      return undefined;
    });
    mockGetSessionByHash.mockImplementation(async (hash: string) => {
      if (hash === sessionHash) {
        return {
          id: "sess_unknown",
          tokenHash: sessionHash,
          role: "custom_role",
          expiresAt: Date.now() + 86400000,
          createdAt: Date.now(),
        };
      }
      return null;
    });
    mockUpdateSessionByHash.mockResolvedValue(undefined);

    const req = makeRequest({});
    // viewer role also has rank 1 (default), so custom_role should pass
    const result = await requireAdmin(req, { role: "viewer" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("custom_role");
      expect(result.authType).toBe("session");
    }
  });

  it("rejects unknown role when admin role is required", async () => {
    const sessionToken = "unknown-role-session-2";
    const sessionHash = hashToken(sessionToken);
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "admin_session") return { value: sessionToken };
      return undefined;
    });
    mockGetSessionByHash.mockImplementation(async (hash: string) => {
      if (hash === sessionHash) {
        return {
          id: "sess_unknown2",
          tokenHash: sessionHash,
          role: "custom_role",
          expiresAt: Date.now() + 86400000,
          createdAt: Date.now(),
        };
      }
      return null;
    });
    mockUpdateSessionByHash.mockResolvedValue(undefined);

    const req = makeRequest({});
    const result = await requireAdmin(req, { role: "admin" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.body).toEqual({ error: "forbidden" });
    }
  });

  it("authenticates via DB access token with Bearer", async () => {
    const dbToken = "db-access-token-123";
    const dbTokenHash = hashToken(dbToken);
    mockGetAccessTokenByHash.mockImplementation(async (hash: string) => {
      if (hash === dbTokenHash) {
        return {
          id: "tok_1",
          tokenHash: dbTokenHash,
          tokenPrefix: "db-ac",
          role: "ops",
          label: "CI Token",
          status: "active",
          createdAt: Date.now(),
        };
      }
      return null;
    });
    mockTouchAccessTokenByHash.mockResolvedValue(true);

    const req = makeRequest({ authorization: `Bearer ${dbToken}` });
    const result = await requireAdmin(req);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.role).toBe("ops");
      expect(result.authType).toBe("token");
      expect(result.tokenLabel).toBe("CI Token");
    }
    expect(mockTouchAccessTokenByHash).toHaveBeenCalledWith(dbTokenHash);
  });
});

describe("createAdminSession", () => {
  it("creates session with correct fields", async () => {
    mockCreateSession.mockResolvedValue(undefined);
    const result = await createAdminSession({
      role: "admin",
      label: "test",
      ip: "1.2.3.4",
      userAgent: "Mozilla/5.0",
    });
    expect(result.token).toBeTruthy();
    expect(result.token.length).toBe(64);
    expect(result.session.id).toMatch(/^sess_/);
    expect(result.session.tokenHash).toBe(hashToken(result.token));
    expect(result.session.role).toBe("admin");
    expect(result.session.label).toBe("test");
    expect(result.session.ip).toBe("1.2.3.4");
    expect(result.session.userAgent).toBe("Mozilla/5.0");
    expect(result.session.expiresAt).toBeGreaterThan(Date.now());
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it("returns token and session", async () => {
    mockCreateSession.mockResolvedValue(undefined);
    const result = await createAdminSession({ role: "ops" });
    expect(result).toHaveProperty("token");
    expect(result).toHaveProperty("session");
    expect(typeof result.token).toBe("string");
    expect(typeof result.session).toBe("object");
  });
});

describe("rotateAdminSession", () => {
  it("creates new session and removes old", async () => {
    const oldToken = "old-session-token";
    const oldHash = hashToken(oldToken);
    mockGetSessionByHash.mockImplementation(async (hash: string) => {
      if (hash === oldHash) {
        return {
          id: "sess_old",
          tokenHash: oldHash,
          role: "admin",
          label: "main",
          ip: "1.2.3.4",
          userAgent: "UA",
          expiresAt: Date.now() + 86400000,
          createdAt: Date.now(),
        };
      }
      return null;
    });
    mockRemoveSessionByHash.mockResolvedValue(true);
    mockCreateSession.mockResolvedValue(undefined);

    const result = await rotateAdminSession(oldToken);
    expect(result).not.toBeNull();
    expect(result!.token).toBeTruthy();
    expect(result!.token).not.toBe(oldToken);
    expect(result!.session.role).toBe("admin");
    expect(mockRemoveSessionByHash).toHaveBeenCalledWith(oldHash);
    expect(mockCreateSession).toHaveBeenCalledTimes(1);
  });

  it("returns null for missing session", async () => {
    mockGetSessionByHash.mockResolvedValue(null);
    const result = await rotateAdminSession("nonexistent-token");
    expect(result).toBeNull();
    expect(mockRemoveSessionByHash).not.toHaveBeenCalled();
  });
});

describe("revokeAdminSession", () => {
  it("removes session by hash", async () => {
    mockRemoveSessionByHash.mockResolvedValue(true);
    const token = "session-to-revoke";
    const result = await revokeAdminSession(token);
    expect(result).toBe(true);
    expect(mockRemoveSessionByHash).toHaveBeenCalledWith(hashToken(token));
  });
});

describe("getAdminSession", () => {
  it("returns session from cookie", async () => {
    const sessionToken = "my-session-token";
    const sessionHash = hashToken(sessionToken);
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "admin_session") return { value: sessionToken };
      return undefined;
    });
    mockGetSessionByHash.mockImplementation(async (hash: string) => {
      if (hash === sessionHash) {
        return {
          id: "sess_1",
          tokenHash: sessionHash,
          role: "admin",
          expiresAt: Date.now() + 86400000,
          createdAt: Date.now(),
        };
      }
      return null;
    });

    const session = await getAdminSession();
    expect(session).not.toBeNull();
    expect(session!.id).toBe("sess_1");
    expect(session!.role).toBe("admin");
  });

  it("returns null for expired session", async () => {
    const sessionToken = "expired-token";
    const sessionHash = hashToken(sessionToken);
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "admin_session") return { value: sessionToken };
      if (name === "admin_token") return undefined;
      return undefined;
    });
    mockGetSessionByHash.mockImplementation(async (hash: string) => {
      if (hash === sessionHash) {
        return {
          id: "sess_expired",
          tokenHash: sessionHash,
          role: "admin",
          expiresAt: Date.now() - 1000,
          createdAt: Date.now() - 86400000,
        };
      }
      return null;
    });
    mockRemoveSessionByHash.mockResolvedValue(true);

    const session = await getAdminSession();
    expect(session).toBeNull();
    expect(mockRemoveSessionByHash).toHaveBeenCalledWith(sessionHash);
  });

  it("falls back to legacy cookie", async () => {
    mockCookieStore.get.mockImplementation((name: string) => {
      if (name === "admin_session") return undefined;
      if (name === "admin_token") return { value: "test-admin-token" };
      return undefined;
    });

    const session = await getAdminSession();
    expect(session).not.toBeNull();
    expect(session!.id).toBe("legacy");
    expect(session!.role).toBe("admin");
  });
});

describe("enforceAdminIpAllowlist", () => {
  it("returns null when no allowlist configured", () => {
    // ADMIN_IP_ALLOWLIST is "" in our mock env
    const req = makeRequest({ "x-forwarded-for": "1.2.3.4" });
    const result = enforceAdminIpAllowlist(req);
    expect(result).toBeNull();
  });
});

describe("ensureSameOrigin", () => {
  it("returns true for matching origin/host", () => {
    const req = makeRequest({ origin: "https://example.com", host: "example.com" });
    expect(ensureSameOrigin(req)).toBe(true);
  });

  it("returns false for mismatched origin", () => {
    const req = makeRequest({ origin: "https://evil.com", host: "example.com" });
    expect(ensureSameOrigin(req)).toBe(false);
  });

  it("returns true when origin header is missing", () => {
    const req = makeRequest({ host: "example.com" });
    expect(ensureSameOrigin(req)).toBe(true);
  });

  it("returns true when host header is missing", () => {
    const req = makeRequest({ origin: "https://example.com" });
    expect(ensureSameOrigin(req)).toBe(true);
  });

  it("returns false for invalid origin URL", () => {
    const req = makeRequest({ origin: "not-a-url", host: "example.com" });
    expect(ensureSameOrigin(req)).toBe(false);
  });
});

describe("enforceLoginRateLimit", () => {
  it("delegates to rateLimit with login-specific limits", async () => {
    mockRateLimit.mockResolvedValue(true);
    const req = makeRequest({ "x-forwarded-for": "1.2.3.4" });
    const result = await enforceLoginRateLimit(req);
    expect(result).toBe(true);
    expect(mockRateLimit).toHaveBeenCalledWith(expect.stringContaining("admin:"), 10, 60000);
  });
});

describe("getAdminRoleForToken", () => {
  it("checks DB first then env tokens", async () => {
    const token = "some-token";
    const tokenHash = hashToken(token);
    mockGetAccessTokenByHash.mockImplementation(async (hash: string) => {
      if (hash === tokenHash) {
        return {
          id: "tok_1",
          tokenHash,
          tokenPrefix: "some",
          role: "ops",
          label: "DB Token",
          status: "active",
          createdAt: Date.now(),
        };
      }
      return null;
    });

    const result = await getAdminRoleForToken(token);
    expect(result).not.toBeNull();
    expect(result!.role).toBe("ops");
    expect(result!.source).toBe("db");
  });

  it("falls back to env tokens when not in DB", async () => {
    mockGetAccessTokenByHash.mockResolvedValue(null);
    const result = await getAdminRoleForToken("test-admin-token");
    expect(result).not.toBeNull();
    expect(result!.role).toBe("admin");
    expect(result!.source).toBe("env");
  });

  it("returns null for unknown token", async () => {
    mockGetAccessTokenByHash.mockResolvedValue(null);
    const result = await getAdminRoleForToken("unknown-token");
    expect(result).toBeNull();
  });

  it("returns null for null/undefined input", async () => {
    expect(await getAdminRoleForToken(null)).toBeNull();
    expect(await getAdminRoleForToken(undefined)).toBeNull();
  });
});

describe("getAdminTokensSummary", () => {
  it("returns token summaries from env", () => {
    const summary = getAdminTokensSummary();
    expect(Array.isArray(summary)).toBe(true);
    // Should include ADMIN_DASH_TOKEN
    expect(summary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "admin", label: "ADMIN_DASH_TOKEN" }),
      ])
    );
  });
});

describe("parseAdminTokens (via getAdminTokensSummary)", () => {
  it("handles JSON array format via getAdminTokensSummary", () => {
    // The default env has ADMIN_DASH_TOKEN set, so we get at least one entry
    const summary = getAdminTokensSummary();
    expect(summary.length).toBeGreaterThanOrEqual(1);
    for (const entry of summary) {
      expect(entry).toHaveProperty("role");
      expect(entry).toHaveProperty("label");
    }
  });

  it("parses ADMIN_TOKENS_JSON array format", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/env", () => ({
      env: {
        ADMIN_SESSION_TTL_HOURS: 24,
        ADMIN_RATE_LIMIT_WINDOW_MS: 60000,
        ADMIN_RATE_LIMIT_MAX: 60,
        ADMIN_LOGIN_RATE_LIMIT_MAX: 10,
        ADMIN_IP_ALLOWLIST: "",
        ADMIN_REQUIRE_SESSION: "0",
        ADMIN_TOKENS_JSON: JSON.stringify([
          { token: "tok-a", role: "admin", label: "Token A" },
          { token: "tok-b", role: "ops" },
        ]),
        ADMIN_TOKENS: undefined,
        ADMIN_DASH_TOKEN: undefined,
        LEDGER_ADMIN_TOKEN: undefined,
      },
    }));
    vi.doMock("next/headers", () => ({
      cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
    }));
    vi.doMock("next/server", () => ({
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
          body,
          status: init?.status ?? 200,
        }),
      },
    }));
    vi.doMock("../session-store-edge", () => ({
      createSession: mockCreateSession,
      getSessionByHash: mockGetSessionByHash,
      removeSessionByHash: mockRemoveSessionByHash,
      updateSessionByHash: mockUpdateSessionByHash,
      getAccessTokenByHash: mockGetAccessTokenByHash,
      touchAccessTokenByHash: mockTouchAccessTokenByHash,
    }));
    vi.doMock("../../rate-limit", () => ({ rateLimit: mockRateLimit }));
    vi.doMock("../admin-ip-utils", () => ({
      isIpAllowed: mockIsIpAllowed,
      normalizeClientIp: mockNormalizeClientIp,
    }));
    const mod = await import("../admin-auth");
    const summary = mod.getAdminTokensSummary();
    expect(summary).toEqual([
      { role: "admin", label: "Token A" },
      { role: "ops", label: "ops" },
    ]);
  });

  it("parses ADMIN_TOKENS_JSON object format", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/env", () => ({
      env: {
        ADMIN_SESSION_TTL_HOURS: 24,
        ADMIN_RATE_LIMIT_WINDOW_MS: 60000,
        ADMIN_RATE_LIMIT_MAX: 60,
        ADMIN_LOGIN_RATE_LIMIT_MAX: 10,
        ADMIN_IP_ALLOWLIST: "",
        ADMIN_REQUIRE_SESSION: "0",
        ADMIN_TOKENS_JSON: JSON.stringify({
          admin: "tok-admin",
          ops: ["tok-ops-1", "tok-ops-2"],
        }),
        ADMIN_TOKENS: undefined,
        ADMIN_DASH_TOKEN: undefined,
        LEDGER_ADMIN_TOKEN: undefined,
      },
    }));
    vi.doMock("next/headers", () => ({
      cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
    }));
    vi.doMock("next/server", () => ({
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
          body,
          status: init?.status ?? 200,
        }),
      },
    }));
    vi.doMock("../session-store-edge", () => ({
      createSession: mockCreateSession,
      getSessionByHash: mockGetSessionByHash,
      removeSessionByHash: mockRemoveSessionByHash,
      updateSessionByHash: mockUpdateSessionByHash,
      getAccessTokenByHash: mockGetAccessTokenByHash,
      touchAccessTokenByHash: mockTouchAccessTokenByHash,
    }));
    vi.doMock("../../rate-limit", () => ({ rateLimit: mockRateLimit }));
    vi.doMock("../admin-ip-utils", () => ({
      isIpAllowed: mockIsIpAllowed,
      normalizeClientIp: mockNormalizeClientIp,
    }));
    const mod = await import("../admin-auth");
    const summary = mod.getAdminTokensSummary();
    expect(summary).toEqual([
      { role: "admin", label: "admin" },
      { role: "ops", label: "ops" },
      { role: "ops", label: "ops" },
    ]);
  });

  it("parses ADMIN_TOKENS semicolon-separated format", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/env", () => ({
      env: {
        ADMIN_SESSION_TTL_HOURS: 24,
        ADMIN_RATE_LIMIT_WINDOW_MS: 60000,
        ADMIN_RATE_LIMIT_MAX: 60,
        ADMIN_LOGIN_RATE_LIMIT_MAX: 10,
        ADMIN_IP_ALLOWLIST: "",
        ADMIN_REQUIRE_SESSION: "0",
        ADMIN_TOKENS_JSON: undefined,
        ADMIN_TOKENS: "admin:tok-admin-1;ops:tok-ops-1",
        ADMIN_DASH_TOKEN: undefined,
        LEDGER_ADMIN_TOKEN: undefined,
      },
    }));
    vi.doMock("next/headers", () => ({
      cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
    }));
    vi.doMock("next/server", () => ({
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
          body,
          status: init?.status ?? 200,
        }),
      },
    }));
    vi.doMock("../session-store-edge", () => ({
      createSession: mockCreateSession,
      getSessionByHash: mockGetSessionByHash,
      removeSessionByHash: mockRemoveSessionByHash,
      updateSessionByHash: mockUpdateSessionByHash,
      getAccessTokenByHash: mockGetAccessTokenByHash,
      touchAccessTokenByHash: mockTouchAccessTokenByHash,
    }));
    vi.doMock("../../rate-limit", () => ({ rateLimit: mockRateLimit }));
    vi.doMock("../admin-ip-utils", () => ({
      isIpAllowed: mockIsIpAllowed,
      normalizeClientIp: mockNormalizeClientIp,
    }));
    const mod = await import("../admin-auth");
    const summary = mod.getAdminTokensSummary();
    expect(summary).toEqual([
      { role: "admin", label: "admin" },
      { role: "ops", label: "ops" },
    ]);
  });

  it("handles invalid ADMIN_TOKENS_JSON gracefully", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/env", () => ({
      env: {
        ADMIN_SESSION_TTL_HOURS: 24,
        ADMIN_RATE_LIMIT_WINDOW_MS: 60000,
        ADMIN_RATE_LIMIT_MAX: 60,
        ADMIN_LOGIN_RATE_LIMIT_MAX: 10,
        ADMIN_IP_ALLOWLIST: "",
        ADMIN_REQUIRE_SESSION: "0",
        ADMIN_TOKENS_JSON: "not-valid-json{{{",
        ADMIN_TOKENS: undefined,
        ADMIN_DASH_TOKEN: "fallback-token",
        LEDGER_ADMIN_TOKEN: undefined,
      },
    }));
    vi.doMock("next/headers", () => ({
      cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
    }));
    vi.doMock("next/server", () => ({
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
          body,
          status: init?.status ?? 200,
        }),
      },
    }));
    vi.doMock("../session-store-edge", () => ({
      createSession: mockCreateSession,
      getSessionByHash: mockGetSessionByHash,
      removeSessionByHash: mockRemoveSessionByHash,
      updateSessionByHash: mockUpdateSessionByHash,
      getAccessTokenByHash: mockGetAccessTokenByHash,
      touchAccessTokenByHash: mockTouchAccessTokenByHash,
    }));
    vi.doMock("../../rate-limit", () => ({ rateLimit: mockRateLimit }));
    vi.doMock("../admin-ip-utils", () => ({
      isIpAllowed: mockIsIpAllowed,
      normalizeClientIp: mockNormalizeClientIp,
    }));
    const mod = await import("../admin-auth");
    const summary = mod.getAdminTokensSummary();
    // Should still have ADMIN_DASH_TOKEN
    expect(summary).toEqual([{ role: "admin", label: "ADMIN_DASH_TOKEN" }]);
  });

  it("includes LEDGER_ADMIN_TOKEN with finance role when ADMIN_DASH_TOKEN exists", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/env", () => ({
      env: {
        ADMIN_SESSION_TTL_HOURS: 24,
        ADMIN_RATE_LIMIT_WINDOW_MS: 60000,
        ADMIN_RATE_LIMIT_MAX: 60,
        ADMIN_LOGIN_RATE_LIMIT_MAX: 10,
        ADMIN_IP_ALLOWLIST: "",
        ADMIN_REQUIRE_SESSION: "0",
        ADMIN_TOKENS_JSON: undefined,
        ADMIN_TOKENS: undefined,
        ADMIN_DASH_TOKEN: "admin-tok",
        LEDGER_ADMIN_TOKEN: "ledger-tok",
      },
    }));
    vi.doMock("next/headers", () => ({
      cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
    }));
    vi.doMock("next/server", () => ({
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
          body,
          status: init?.status ?? 200,
        }),
      },
    }));
    vi.doMock("../session-store-edge", () => ({
      createSession: mockCreateSession,
      getSessionByHash: mockGetSessionByHash,
      removeSessionByHash: mockRemoveSessionByHash,
      updateSessionByHash: mockUpdateSessionByHash,
      getAccessTokenByHash: mockGetAccessTokenByHash,
      touchAccessTokenByHash: mockTouchAccessTokenByHash,
    }));
    vi.doMock("../../rate-limit", () => ({ rateLimit: mockRateLimit }));
    vi.doMock("../admin-ip-utils", () => ({
      isIpAllowed: mockIsIpAllowed,
      normalizeClientIp: mockNormalizeClientIp,
    }));
    const mod = await import("../admin-auth");
    const summary = mod.getAdminTokensSummary();
    expect(summary).toEqual([
      { role: "admin", label: "ADMIN_DASH_TOKEN" },
      { role: "finance", label: "LEDGER_ADMIN_TOKEN" },
    ]);
  });

  it("includes LEDGER_ADMIN_TOKEN with admin role when ADMIN_DASH_TOKEN is absent", async () => {
    vi.resetModules();
    vi.doMock("server-only", () => ({}));
    vi.doMock("@/lib/env", () => ({
      env: {
        ADMIN_SESSION_TTL_HOURS: 24,
        ADMIN_RATE_LIMIT_WINDOW_MS: 60000,
        ADMIN_RATE_LIMIT_MAX: 60,
        ADMIN_LOGIN_RATE_LIMIT_MAX: 10,
        ADMIN_IP_ALLOWLIST: "",
        ADMIN_REQUIRE_SESSION: "0",
        ADMIN_TOKENS_JSON: undefined,
        ADMIN_TOKENS: undefined,
        ADMIN_DASH_TOKEN: undefined,
        LEDGER_ADMIN_TOKEN: "ledger-tok",
      },
    }));
    vi.doMock("next/headers", () => ({
      cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
    }));
    vi.doMock("next/server", () => ({
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
          body,
          status: init?.status ?? 200,
        }),
      },
    }));
    vi.doMock("../session-store-edge", () => ({
      createSession: mockCreateSession,
      getSessionByHash: mockGetSessionByHash,
      removeSessionByHash: mockRemoveSessionByHash,
      updateSessionByHash: mockUpdateSessionByHash,
      getAccessTokenByHash: mockGetAccessTokenByHash,
      touchAccessTokenByHash: mockTouchAccessTokenByHash,
    }));
    vi.doMock("../../rate-limit", () => ({ rateLimit: mockRateLimit }));
    vi.doMock("../admin-ip-utils", () => ({
      isIpAllowed: mockIsIpAllowed,
      normalizeClientIp: mockNormalizeClientIp,
    }));
    const mod = await import("../admin-auth");
    const summary = mod.getAdminTokensSummary();
    expect(summary).toEqual([{ role: "admin", label: "LEDGER_ADMIN_TOKEN" }]);
  });
});
