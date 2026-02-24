import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetAdminSession, mockRevokeAdminSession, mockRecordAudit, mockCookies } = vi.hoisted(
  () => ({
    mockGetAdminSession: vi.fn(),
    mockRevokeAdminSession: vi.fn(),
    mockRecordAudit: vi.fn(),
    mockCookies: vi.fn(),
  })
);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({
  ADMIN_SESSION_COOKIE: "admin_session",
  LEGACY_ADMIN_COOKIE: "admin_token",
  getAdminSession: mockGetAdminSession,
  revokeAdminSession: mockRevokeAdminSession,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mockRecordAudit }));
vi.mock("next/headers", () => ({ cookies: mockCookies }));

import { POST } from "../route";

beforeEach(() => {
  vi.clearAllMocks();
  mockCookies.mockResolvedValue({
    get: vi.fn().mockReturnValue({ value: "session-token" }),
  });
  mockGetAdminSession.mockResolvedValue({ id: "s1", role: "admin" });
  mockRevokeAdminSession.mockResolvedValue(undefined);
});

describe("POST /api/admin/logout", () => {
  it("revokes session and clears cookies", async () => {
    const res = await POST(new Request("http://localhost/api/admin/logout", { method: "POST" }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockRevokeAdminSession).toHaveBeenCalledWith("session-token");
    expect(mockRecordAudit).toHaveBeenCalled();
  });

  it("handles missing session token", async () => {
    mockCookies.mockResolvedValue({ get: vi.fn().mockReturnValue(undefined) });
    const res = await POST(new Request("http://localhost/api/admin/logout", { method: "POST" }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockRevokeAdminSession).not.toHaveBeenCalled();
  });

  it("handles session token present but no session found", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const res = await POST(new Request("http://localhost/api/admin/logout", { method: "POST" }));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockRevokeAdminSession).toHaveBeenCalledWith("session-token");
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });
});
