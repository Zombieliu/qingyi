import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  listRevenueOrdersSinceEdgeRead: vi.fn(),
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
  listRevenueOrdersSinceEdgeRead: mocks.listRevenueOrdersSinceEdgeRead,
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
  const url = new URL("http://localhost/api/admin/revenue");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

describe("GET /api/admin/revenue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(authOk);
    mocks.getCache.mockReturnValue(null);
    mocks.computeJsonEtag.mockReturnValue("etag-1");
    mocks.jsonWithEtag.mockImplementation((data: unknown) => Response.json(data));
    mocks.formatDateISO.mockImplementation((value: Date | string | number) => {
      const date = value instanceof Date ? value : new Date(value);
      return date.toISOString().slice(0, 10);
    });
    mocks.listRevenueOrdersSinceEdgeRead.mockResolvedValue([]);
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

  it("aggregates summary, item and source revenue", async () => {
    mocks.listRevenueOrdersSinceEdgeRead.mockResolvedValue([
      {
        amount: 100,
        currency: "CNY",
        stage: "已完成",
        item: "陪练",
        source: "web",
        serviceFee: 10,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
      {
        amount: 200,
        currency: "CNY",
        stage: "已完成",
        item: "代练",
        source: null,
        serviceFee: 20,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
      {
        amount: 50,
        currency: "CNY",
        stage: "已取消",
        item: "陪练",
        source: "web",
        serviceFee: 5,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ]);

    const res = await GET(makeReq({ days: "30" }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.summary).toEqual({
      totalRevenue: 300,
      totalServiceFee: 30,
      completedOrders: 2,
      cancelledOrders: 1,
      cancelledAmount: 50,
      avgOrderValue: 150,
      totalOrders: 3,
    });
    expect(body.byItem[0]).toMatchObject({ item: "代练", revenue: 200 });
    expect(body.bySource[0]).toMatchObject({ source: "unknown", revenue: 200 });
    expect(mocks.setCache).toHaveBeenCalled();
  });
});
