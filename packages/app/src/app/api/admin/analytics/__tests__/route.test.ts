import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listGrowthEventsSinceEdgeRead: vi.fn(),
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
  listGrowthEventsSinceEdgeRead: mocks.listGrowthEventsSinceEdgeRead,
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
  const url = new URL("http://localhost/api/admin/analytics");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

describe("GET /api/admin/analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(authOk);
    mocks.getCache.mockReturnValue(null);
    mocks.computeJsonEtag.mockReturnValue("etag-1");
    mocks.jsonWithEtag.mockImplementation((data: unknown, etag: string) =>
      Response.json(data, { headers: { ETag: etag } })
    );
    mocks.listGrowthEventsSinceEdgeRead.mockResolvedValue([]);
  });

  it("returns 401 when auth fails", async () => {
    mocks.requireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 304 when etag matches", async () => {
    mocks.getCache.mockReturnValue({ value: { ok: true }, etag: "etag-cached" });
    mocks.getIfNoneMatch.mockReturnValue("etag-cached");
    mocks.notModified.mockReturnValue(new Response(null, { status: 304 }));

    const res = await GET(makeReq());
    expect(res.status).toBe(304);
  });

  it("builds analytics payload from growth events", async () => {
    mocks.listGrowthEventsSinceEdgeRead.mockResolvedValue([
      {
        event: "page_view",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        path: "/home",
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
      {
        event: "page_view",
        clientId: "c2",
        sessionId: null,
        userAddress: null,
        path: "/home",
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
      {
        event: "order_intent",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        path: "/checkout",
        createdAt: new Date("2025-01-01T01:00:00.000Z"),
      },
      {
        event: "order_create_success",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        path: "/checkout",
        createdAt: new Date("2025-01-01T02:00:00.000Z"),
      },
    ]);

    const res = await GET(makeReq({ days: "200" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.rangeDays).toBe(90);
    expect(body.totalEvents).toBe(4);
    expect(body.events[0]).toEqual({ event: "page_view", count: 2, unique: 2 });
    expect(body.funnel).toEqual([
      { step: "page_view", unique: 2, conversionFromPrev: 1 },
      { step: "order_intent", unique: 1, conversionFromPrev: 0.5 },
      { step: "order_create_success", unique: 1, conversionFromPrev: 1 },
    ]);
    expect(body.topPaths[0]).toEqual({ path: "/home", count: 2 });
    expect(mocks.setCache).toHaveBeenCalled();
  });
});
