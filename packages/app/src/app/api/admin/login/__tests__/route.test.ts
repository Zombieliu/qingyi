import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockEnforceLoginRateLimit,
  mockEnforceAdminIpAllowlist,
  mockGetAdminRoleForToken,
  mockCreateAdminSession,
  mockTouchAccessTokenByHash,
  mockRecordAudit,
} = vi.hoisted(() => ({
  mockEnforceLoginRateLimit: vi.fn(),
  mockEnforceAdminIpAllowlist: vi.fn(),
  mockGetAdminRoleForToken: vi.fn(),
  mockCreateAdminSession: vi.fn(),
  mockTouchAccessTokenByHash: vi.fn(),
  mockRecordAudit: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin/admin-auth", () => ({
  ADMIN_SESSION_COOKIE: "admin_session",
  enforceLoginRateLimit: mockEnforceLoginRateLimit,
  enforceAdminIpAllowlist: mockEnforceAdminIpAllowlist,
  getAdminRoleForToken: mockGetAdminRoleForToken,
  createAdminSession: mockCreateAdminSession,
}));

vi.mock("@/lib/admin/session-store-edge", () => ({
  touchAccessTokenByHash: mockTouchAccessTokenByHash,
}));

vi.mock("@/lib/admin/admin-audit", () => ({
  recordAudit: mockRecordAudit,
}));

vi.mock("@/lib/env", () => ({
  env: { ADMIN_SESSION_TTL_HOURS: 24 },
}));

import { POST } from "../route";

function makePostRequest(body: unknown) {
  return new Request("http://localhost/api/admin/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnforceLoginRateLimit.mockResolvedValue(true);
  mockEnforceAdminIpAllowlist.mockReturnValue(null);
  mockGetAdminRoleForToken.mockResolvedValue({
    role: "admin",
    label: "test-token",
    source: "env",
  });
  mockCreateAdminSession.mockResolvedValue({
    token: "session-token-abc",
    session: { id: "sess-1" },
  });
});

describe("POST /api/admin/login", () => {
  it("returns 429 when rate limited", async () => {
    mockEnforceLoginRateLimit.mockResolvedValue(false);
    const res = await POST(makePostRequest({ token: "abc" }));
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.error).toBe("登录过于频繁");
  });

  it("returns IP allowlist response when blocked", async () => {
    const ipResponse = Response.json({ error: "IP blocked" }, { status: 403 });
    mockEnforceAdminIpAllowlist.mockReturnValue(ipResponse);
    const res = await POST(makePostRequest({ token: "abc" }));
    expect(res.status).toBe(403);
  });

  it("returns 400 for invalid JSON body", async () => {
    const req = new Request("http://localhost/api/admin/login", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
  it("returns 400 when token is empty", async () => {
    const res = await POST(makePostRequest({ token: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when token field is missing", async () => {
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 401 when token is invalid", async () => {
    mockGetAdminRoleForToken.mockResolvedValue(null);
    const res = await POST(makePostRequest({ token: "wrong" }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("密钥错误");
  });

  it("touches access token when source is db", async () => {
    mockGetAdminRoleForToken.mockResolvedValue({
      role: "admin",
      label: "db-token",
      source: "db",
      tokenHash: "hash123",
    });
    await POST(makePostRequest({ token: "valid" }));
    expect(mockTouchAccessTokenByHash).toHaveBeenCalledWith("hash123");
  });

  it("returns 503 when session creation fails", async () => {
    mockCreateAdminSession.mockRejectedValue(new Error("DB down"));
    const res = await POST(makePostRequest({ token: "valid" }));
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("服务暂不可用");
  });

  it("returns ok with role and sets cookie on success", async () => {
    const res = await POST(makePostRequest({ token: "valid" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.role).toBe("admin");
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toContain("admin_session=session-token-abc");
  });

  it("records audit on successful login", async () => {
    await POST(makePostRequest({ token: "valid" }));
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: "admin", sessionId: "sess-1", authType: "login" }),
      "auth.login"
    );
  });
});
