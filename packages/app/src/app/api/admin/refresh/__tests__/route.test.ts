import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockGetAdminSessionTokenFromCookies,
  mockRotateAdminSession,
  mockRecordAudit,
  mockEnv,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetAdminSessionTokenFromCookies: vi.fn(),
  mockRotateAdminSession: vi.fn(),
  mockRecordAudit: vi.fn(),
  mockEnv: { ADMIN_SESSION_TTL_HOURS: 24 },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({
  ADMIN_SESSION_COOKIE: "admin_session",
  requireAdmin: mockRequireAdmin,
  getAdminSessionTokenFromCookies: mockGetAdminSessionTokenFromCookies,
  rotateAdminSession: mockRotateAdminSession,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));
vi.mock("@/lib/env", () => ({ env: mockEnv }));

import { POST } from "../route";

const authOk = { ok: true, role: "viewer", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
});

describe("POST /api/admin/refresh", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await POST(new Request("http://localhost/api/admin/refresh", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when session token is missing", async () => {
    mockGetAdminSessionTokenFromCookies.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost/api/admin/refresh", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("returns 401 when rotation fails", async () => {
    mockGetAdminSessionTokenFromCookies.mockResolvedValue("old-token");
    mockRotateAdminSession.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost/api/admin/refresh", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("rotates session successfully", async () => {
    mockGetAdminSessionTokenFromCookies.mockResolvedValue("old-token");
    mockRotateAdminSession.mockResolvedValue({ token: "new-token" });
    const res = await POST(new Request("http://localhost/api/admin/refresh", { method: "POST" }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockRecordAudit).toHaveBeenCalled();
  });
});
