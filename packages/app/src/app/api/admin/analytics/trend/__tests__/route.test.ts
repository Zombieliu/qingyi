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
  formatDateISO: vi.fn(),
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
vi.mock("@/lib/shared/date-utils", () => ({ formatDateISO: mocks.formatDateISO }));

import { GET } from "../route";

function makeReq(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/analytics/trend");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

describe("GET /api/admin/analytics/trend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(authOk);
    mocks.getCache.mockReturnValue(null);
    mocks.computeJsonEtag.mockReturnValue("etag-1");
    mocks.jsonWithEtag.mockImplementation((data: unknown, etag: string) =>
      Response.json(data, { headers: { ETag: etag } })
    );
    mocks.listGrowthEventsSinceEdgeRead.mockResolvedValue([]);
    mocks.formatDateISO.mockImplementation((value: Date | string | number) => {
      const date = value instanceof Date ? value : new Date(value);
      return date.toISOString().slice(0, 10);
    });
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

  it("builds trend and retention payload", async () => {
    mocks.listGrowthEventsSinceEdgeRead.mockResolvedValue([
      {
        event: "order_create_success",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        path: null,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
      {
        event: "page_view",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        path: null,
        createdAt: new Date("2025-01-02T00:00:00.000Z"),
      },
      {
        event: "order_intent",
        clientId: "c2",
        sessionId: null,
        userAddress: null,
        path: null,
        createdAt: new Date("2025-01-02T00:00:00.000Z"),
      },
    ]);

    const res = await GET(makeReq({ days: "7" }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.rangeDays).toBe(7);
    expect(body.trend).toHaveLength(7);
    expect(body.retention).toEqual({
      orderUsers: 1,
      returnUsers: 1,
      rate: 100,
    });
    expect(mocks.setCache).toHaveBeenCalled();
  });
});
