import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockPrisma,
  mockGetCache,
  mockSetCache,
  mockComputeJsonEtag,
  mockGetIfNoneMatch,
  mockJsonWithEtag,
  mockNotModified,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockPrisma: { growthEvent: { findMany: vi.fn() } },
  mockGetCache: vi.fn(),
  mockSetCache: vi.fn(),
  mockComputeJsonEtag: vi.fn(),
  mockGetIfNoneMatch: vi.fn(),
  mockJsonWithEtag: vi.fn(),
  mockNotModified: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));
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

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makeReq(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/analytics");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockGetCache.mockReturnValue(null);
  mockComputeJsonEtag.mockReturnValue("etag-1");
  mockJsonWithEtag.mockImplementation((data: unknown, etag: string) =>
    Response.json(data, { headers: { ETag: etag } })
  );
  mockPrisma.growthEvent.findMany.mockResolvedValue([]);
});

describe("GET /api/admin/analytics", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns cached data with matching etag (304)", async () => {
    mockGetCache.mockReturnValue({ value: { test: 1 }, etag: "etag-cached" });
    mockGetIfNoneMatch.mockReturnValue("etag-cached");
    mockNotModified.mockReturnValue(new Response(null, { status: 304 }));
    const res = await GET(makeReq());
    expect(res.status).toBe(304);
  });

  it("returns cached data when etag does not match", async () => {
    mockGetCache.mockReturnValue({ value: { test: 1 }, etag: "etag-cached" });
    mockGetIfNoneMatch.mockReturnValue("other-etag");
    mockJsonWithEtag.mockReturnValue(Response.json({ test: 1 }));
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(mockJsonWithEtag).toHaveBeenCalled();
  });

  it("queries prisma and returns analytics payload", async () => {
    mockPrisma.growthEvent.findMany.mockResolvedValue([]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(mockSetCache).toHaveBeenCalled();
  });

  it("clamps days parameter", async () => {
    await GET(makeReq({ days: "200" }));
    expect(mockPrisma.growthEvent.findMany).toHaveBeenCalled();
  });

  it("processes rows with path data and builds funnel + topPaths", async () => {
    mockPrisma.growthEvent.findMany.mockResolvedValue([
      { event: "page_view", clientId: "c1", sessionId: null, userAddress: null, path: "/home" },
      { event: "page_view", clientId: "c2", sessionId: null, userAddress: null, path: "/home" },
      { event: "order_intent", clientId: "c1", sessionId: null, userAddress: null, path: "/order" },
      {
        event: "order_create_success",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        path: "/order",
      },
      { event: "page_view", clientId: null, sessionId: null, userAddress: null, path: null },
    ]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.totalEvents).toBe(5);
    expect(json.funnel).toHaveLength(3);
    expect(json.funnel[0].step).toBe("page_view");
    expect(json.topPaths.length).toBeGreaterThan(0);
  });

  it("handles NaN days gracefully", async () => {
    mockPrisma.growthEvent.findMany.mockResolvedValue([]);
    const res = await GET(makeReq({ days: "abc" }));
    expect(res.status).toBe(200);
  });
});
