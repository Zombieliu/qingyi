import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getPerformanceSnapshotEdgeRead: vi.fn(),
  getCache: vi.fn(),
  setCache: vi.fn(),
  computeJsonEtag: vi.fn(),
  getIfNoneMatch: vi.fn(),
  jsonWithEtag: vi.fn(),
  notModified: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/edge-db/admin-report-read-store", () => ({
  getPerformanceSnapshotEdgeRead: mocks.getPerformanceSnapshotEdgeRead,
}));
vi.mock("@/lib/server-cache", () => ({
  getCache: mocks.getCache,
  setCache: mocks.setCache,
  computeJsonEtag: mocks.computeJsonEtag,
}));
vi.mock("@/lib/http-cache", () => ({
  getIfNoneMatch: mocks.getIfNoneMatch,
  jsonWithEtag: mocks.jsonWithEtag,
  notModified: mocks.notModified,
}));

import { GET } from "../route";

function makeReq(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/performance");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

describe("GET /api/admin/performance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(authOk);
    mocks.getCache.mockReturnValue(null);
    mocks.computeJsonEtag.mockReturnValue("etag-1");
    mocks.jsonWithEtag.mockImplementation((data: unknown) => Response.json(data));
    mocks.getPerformanceSnapshotEdgeRead.mockResolvedValue({
      orders: [],
      reviews: [],
      players: [],
    });
  });

  it("returns 401 when auth fails", async () => {
    mocks.requireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 304 when etag matches", async () => {
    mocks.getCache.mockReturnValue({ value: {}, etag: "etag-cached" });
    mocks.getIfNoneMatch.mockReturnValue("etag-cached");
    mocks.notModified.mockReturnValue(new Response(null, { status: 304 }));

    const res = await GET(makeReq());
    expect(res.status).toBe(304);
  });

  it("aggregates player performance and ratings", async () => {
    mocks.getPerformanceSnapshotEdgeRead.mockResolvedValue({
      players: [
        { id: "p1", name: "Player 1", address: "0x1" },
        { id: "p2", name: "Player 2", address: "0x2" },
      ],
      orders: [
        { id: "o1", assignedTo: "p1", companionAddress: "0x1", stage: "已完成", amount: 120 },
        { id: "o2", assignedTo: "p1", companionAddress: "0x1", stage: "已取消", amount: 20 },
        { id: "o3", assignedTo: "p2", companionAddress: "0x2", stage: "已完成", amount: 200 },
      ],
      reviews: [
        { companionAddress: "0x1", rating: 5 },
        { companionAddress: "0x1", rating: 3 },
        { companionAddress: "0x2", rating: 4 },
      ],
    });

    const res = await GET(makeReq({ days: "30" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.rangeDays).toBe(30);
    expect(body.performance).toHaveLength(2);
    expect(body.performance[0]).toMatchObject({ playerId: "p2", revenue: 200, avgRating: 4 });
    expect(body.performance[1]).toMatchObject({
      playerId: "p1",
      total: 2,
      completed: 1,
      cancelled: 1,
      avgRating: 4,
      reviewCount: 2,
    });
    expect(mocks.setCache).toHaveBeenCalled();
  });
});
