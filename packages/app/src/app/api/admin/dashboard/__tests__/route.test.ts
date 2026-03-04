import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getDashboardSnapshotEdgeRead: vi.fn(),
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
  getDashboardSnapshotEdgeRead: mocks.getDashboardSnapshotEdgeRead,
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

const authOk = { ok: true, role: "viewer", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

describe("GET /api/admin/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-08T00:00:00.000Z"));

    mocks.requireAdmin.mockResolvedValue(authOk);
    mocks.getCache.mockReturnValue(null);
    mocks.computeJsonEtag.mockReturnValue("etag-1");
    mocks.jsonWithEtag.mockImplementation((data: unknown) => Response.json(data));
    mocks.formatDateISO.mockImplementation((value: Date | string | number) => {
      const date = value instanceof Date ? value : new Date(value);
      return date.toISOString().slice(0, 10);
    });
    mocks.getDashboardSnapshotEdgeRead.mockResolvedValue({
      todayOrders: [],
      yesterdayOrders: [],
      weekOrders: [],
      prevWeekOrders: [],
      allPlayers: [],
      stageDistribution: [],
      todayEvents: [],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 when auth fails", async () => {
    mocks.requireAdmin.mockResolvedValue(authFail);
    const res = await GET(new Request("http://localhost/api/admin/dashboard"));
    expect(res.status).toBe(401);
  });

  it("returns 304 when etag matches", async () => {
    mocks.getCache.mockReturnValue({ value: { ok: true }, etag: "etag-cached" });
    mocks.getIfNoneMatch.mockReturnValue("etag-cached");
    mocks.notModified.mockReturnValue(new Response(null, { status: 304 }));

    const res = await GET(new Request("http://localhost/api/admin/dashboard"));
    expect(res.status).toBe(304);
  });

  it("builds dashboard payload with realtime, funnel and top players", async () => {
    const now = new Date("2025-01-08T10:00:00.000Z");
    mocks.getDashboardSnapshotEdgeRead.mockResolvedValue({
      todayOrders: [
        {
          amount: 200,
          stage: "已完成",
          serviceFee: 20,
          createdAt: now,
          assignedTo: "p1",
          userAddress: "0x1",
        },
        {
          amount: 100,
          stage: "进行中",
          serviceFee: null,
          createdAt: now,
          assignedTo: "p1",
          userAddress: "0x2",
        },
      ],
      yesterdayOrders: [{ amount: 100, stage: "已完成", serviceFee: 10 }],
      weekOrders: [
        {
          amount: 200,
          stage: "已完成",
          serviceFee: 20,
          createdAt: now,
          userAddress: "0x1",
          assignedTo: "p1",
        },
      ],
      prevWeekOrders: [{ amount: 100, stage: "已完成" }],
      allPlayers: [{ id: "p1", name: "Player 1" }],
      stageDistribution: [{ stage: "已完成", _count: 3 }],
      todayEvents: [
        { event: "page_view", userAddress: "0x1" },
        { event: "order_intent", userAddress: "0x1" },
        { event: "order_create_success", userAddress: "0x1" },
      ],
    });

    const res = await GET(new Request("http://localhost/api/admin/dashboard"));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.realtime).toEqual({
      todayOrders: 2,
      todayRevenue: 200,
      todayServiceFee: 20,
      todayUsers: 2,
      todayCompleted: 1,
      yesterdayRevenue: 100,
      revenueChange: 100,
    });
    expect(body.topPlayers).toEqual([{ id: "p1", name: "Player 1", orders: 2, revenue: 200 }]);
    expect(body.funnel).toEqual([
      { step: "访问", count: 1 },
      { step: "下单意向", count: 1 },
      { step: "创建订单", count: 1 },
      { step: "完成订单", count: 1 },
    ]);
    expect(body.comparison).toEqual({
      revenue: { current: 200, previous: 100, change: 100 },
      orders: { current: 1, previous: 1, change: 0 },
    });
    expect(mocks.setCache).toHaveBeenCalled();
  });
});
