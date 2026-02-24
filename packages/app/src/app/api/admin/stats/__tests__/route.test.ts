import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockGetAdminStats,
  mockGetCache,
  mockSetCache,
  mockComputeJsonEtag,
  mockGetIfNoneMatch,
  mockJsonWithEtag,
  mockNotModified,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetAdminStats: vi.fn(),
  mockGetCache: vi.fn(),
  mockSetCache: vi.fn(),
  mockComputeJsonEtag: vi.fn(),
  mockGetIfNoneMatch: vi.fn(),
  mockJsonWithEtag: vi.fn(),
  mockNotModified: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({ getAdminStats: mockGetAdminStats }));
vi.mock("@/lib/server-cache", () => ({
  getCache: mockGetCache,
  setCache: mockSetCache,
  computeJsonEtag: mockComputeJsonEtag,
}));
vi.mock("@/lib/http-cache", () => ({
  getIfNoneMatch: mockGetIfNoneMatch,
  jsonWithEtag: mockJsonWithEtag,
  notModified: mockNotModified,
}));

import { GET } from "../route";

const authOk = { ok: true, role: "viewer", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockGetCache.mockReturnValue(null);
  mockComputeJsonEtag.mockReturnValue("etag-1");
  mockJsonWithEtag.mockImplementation((data: unknown) => Response.json(data));
});

describe("GET /api/admin/stats", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(new Request("http://localhost/api/admin/stats"));
    expect(res.status).toBe(401);
  });

  it("returns 304 when etag matches", async () => {
    mockGetCache.mockReturnValue({ value: {}, etag: "e1" });
    mockGetIfNoneMatch.mockReturnValue("e1");
    mockNotModified.mockReturnValue(new Response(null, { status: 304 }));
    const res = await GET(new Request("http://localhost/api/admin/stats"));
    expect(res.status).toBe(304);
  });

  it("returns cached data when etag does not match", async () => {
    mockGetCache.mockReturnValue({ value: { orders: 10 }, etag: "e1" });
    mockGetIfNoneMatch.mockReturnValue("e-different");
    mockJsonWithEtag.mockImplementation((data: unknown) => Response.json(data));
    const res = await GET(new Request("http://localhost/api/admin/stats"));
    expect(res.status).toBe(200);
    expect(mockJsonWithEtag).toHaveBeenCalledWith({ orders: 10 }, "e1", expect.any(String));
    expect(mockGetAdminStats).not.toHaveBeenCalled();
  });

  it("returns stats data", async () => {
    mockGetAdminStats.mockResolvedValue({ orders: 10, players: 5 });
    const res = await GET(new Request("http://localhost/api/admin/stats"));
    expect(res.status).toBe(200);
    expect(mockSetCache).toHaveBeenCalled();
  });
});
