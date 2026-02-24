import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAdmin, mockGetAdminSession } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetAdminSession: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: mockRequireAdmin,
  getAdminSession: mockGetAdminSession,
}));

import { GET } from "../route";

const authOk = { ok: true, role: "admin", authType: "session", sessionId: "s1", tokenLabel: null };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockGetAdminSession.mockResolvedValue({ expiresAt: 9999999999 });
});

describe("GET /api/admin/me", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(new Request("http://localhost/api/admin/me"));
    expect(res.status).toBe(401);
  });

  it("returns admin session info", async () => {
    const res = await GET(new Request("http://localhost/api/admin/me"));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.role).toBe("admin");
    expect(json.expiresAt).toBe(9999999999);
  });

  it("returns null expiresAt when no session", async () => {
    mockGetAdminSession.mockResolvedValue(null);
    const res = await GET(new Request("http://localhost/api/admin/me"));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.expiresAt).toBeNull();
  });

  it("returns tokenLabel from auth", async () => {
    mockRequireAdmin.mockResolvedValue({ ...authOk, tokenLabel: "my-token" });
    const res = await GET(new Request("http://localhost/api/admin/me"));
    const json = await res.json();
    expect(json.label).toBe("my-token");
  });
});
