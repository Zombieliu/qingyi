import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockRequireAdmin,
  mockGetCache,
  mockSetCache,
  mockComputeJsonEtag,
  mockGetIfNoneMatch,
  mockJsonWithEtag,
  mockNotModified,
  mockFormatDateISO,
  mockPrisma,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockGetCache: vi.fn(),
  mockSetCache: vi.fn(),
  mockComputeJsonEtag: vi.fn(),
  mockGetIfNoneMatch: vi.fn(),
  mockJsonWithEtag: vi.fn(),
  mockNotModified: vi.fn(),
  mockFormatDateISO: vi.fn(),
  mockPrisma: {
    adminOrder: { findMany: vi.fn(), groupBy: vi.fn() },
    adminPlayer: { findMany: vi.fn() },
    growthEvent: { findMany: vi.fn() },
  },
}));

type AdminOrderWhere = {
  createdAt?: {
    gte?: Date;
    lt?: Date;
  };
};

vi.mock("server-only", () => ({}));

vi.mock("@/lib/admin/admin-auth", () => ({
  requireAdmin: mockRequireAdmin,
}));

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

vi.mock("@/lib/shared/date-utils", () => ({
  formatDateISO: mockFormatDateISO,
}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

import { GET } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = {
  ok: false,
  response: Response.json({ error: "Unauthorized" }, { status: 401 }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockGetCache.mockReturnValue(null);
  mockComputeJsonEtag.mockReturnValue('"etag-123"');
  mockGetIfNoneMatch.mockReturnValue("");
  mockFormatDateISO.mockImplementation((d: Date) => d.toISOString().slice(0, 10));
  mockJsonWithEtag.mockImplementation((data: unknown) =>
    Response.json(data, { headers: { ETag: '"etag-123"' } })
  );
  mockNotModified.mockImplementation(() => new Response(null, { status: 304 }));

  mockPrisma.adminOrder.findMany.mockResolvedValue([]);
  mockPrisma.adminOrder.groupBy.mockResolvedValue([]);
  mockPrisma.adminPlayer.findMany.mockResolvedValue([]);
  mockPrisma.growthEvent.findMany.mockResolvedValue([]);
});

describe("GET /api/admin/dashboard", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(new Request("http://localhost/api/admin/dashboard"));
    expect(res.status).toBe(401);
  });

  it("returns 304 when cached etag matches", async () => {
    mockGetCache.mockReturnValue({ value: { cached: true }, etag: '"etag-abc"' });
    mockGetIfNoneMatch.mockReturnValue('"etag-abc"');
    await GET(new Request("http://localhost/api/admin/dashboard"));
    expect(mockNotModified).toHaveBeenCalledWith('"etag-abc"', expect.any(String));
  });
  it("returns cached response when etag does not match", async () => {
    mockGetCache.mockReturnValue({ value: { cached: true }, etag: '"etag-abc"' });
    mockGetIfNoneMatch.mockReturnValue('"different"');
    await GET(new Request("http://localhost/api/admin/dashboard"));
    expect(mockJsonWithEtag).toHaveBeenCalledWith(
      { cached: true },
      '"etag-abc"',
      expect.any(String)
    );
  });

  it("fetches fresh data when no cache exists", async () => {
    await GET(new Request("http://localhost/api/admin/dashboard"));
    expect(mockPrisma.adminOrder.findMany).toHaveBeenCalled();
    expect(mockSetCache).toHaveBeenCalledWith(
      "api:admin:dashboard",
      expect.objectContaining({ realtime: expect.any(Object) }),
      10_000,
      '"etag-123"'
    );
    expect(mockJsonWithEtag).toHaveBeenCalled();
  });

  it("computes realtime stats from today orders", async () => {
    const now = new Date();
    mockPrisma.adminOrder.findMany.mockImplementation(({ where }: { where?: AdminOrderWhere }) => {
      if (where?.createdAt?.gte && !where?.createdAt?.lt) {
        return [
          {
            amount: 100,
            stage: "已完成",
            serviceFee: 10,
            createdAt: now,
            assignedTo: "p1",
            userAddress: "0xabc",
          },
        ];
      }
      return [];
    });
    mockPrisma.adminPlayer.findMany.mockResolvedValue([{ id: "p1", name: "Player1" }]);
    mockPrisma.adminOrder.groupBy.mockResolvedValue([{ stage: "已完成", _count: 1 }]);
    mockPrisma.growthEvent.findMany.mockResolvedValue([]);

    await GET(new Request("http://localhost/api/admin/dashboard"));

    const payload = mockSetCache.mock.calls[0][1];
    expect(payload.realtime.todayOrders).toBeGreaterThanOrEqual(0);
    expect(payload.trends).toBeDefined();
    expect(payload.distribution).toBeDefined();
    expect(payload.funnel).toBeDefined();
  });

  it("computes revenue change and comparison with previous data", async () => {
    const now = new Date();

    mockPrisma.adminOrder.findMany.mockImplementation(({ where }: { where?: AdminOrderWhere }) => {
      // today orders (gte only, no lt)
      if (where?.createdAt?.gte && !where?.createdAt?.lt) {
        return [
          {
            amount: 200,
            stage: "已完成",
            serviceFee: 20,
            createdAt: now,
            assignedTo: "p1",
            userAddress: "0xabc",
          },
          {
            amount: 50,
            stage: "进行中",
            serviceFee: 0,
            createdAt: now,
            assignedTo: null,
            userAddress: "0xdef",
          },
        ];
      }
      // yesterday or prev week (has both gte and lt)
      if (where?.createdAt?.gte && where?.createdAt?.lt) {
        return [{ amount: 100, stage: "已完成", serviceFee: 10 }];
      }
      return [];
    });
    mockPrisma.adminPlayer.findMany.mockResolvedValue([{ id: "p1", name: "Player1" }]);
    mockPrisma.adminOrder.groupBy.mockResolvedValue([{ stage: "已完成", _count: 2 }]);
    mockPrisma.growthEvent.findMany.mockResolvedValue([
      { event: "page_view", userAddress: "0xabc" },
      { event: "order_intent", userAddress: "0xabc" },
      { event: "order_create_success", userAddress: "0xabc" },
    ]);

    await GET(new Request("http://localhost/api/admin/dashboard"));

    const payload = mockSetCache.mock.calls[0][1];
    expect(payload.realtime.todayRevenue).toBe(200);
    expect(payload.realtime.todayServiceFee).toBe(20);
    expect(payload.realtime.todayUsers).toBe(2);
    expect(payload.realtime.todayCompleted).toBe(1);
    expect(payload.funnel).toHaveLength(4);
    expect(payload.funnel[0].count).toBeGreaterThan(0);
    expect(payload.topPlayers).toHaveLength(1);
    expect(payload.topPlayers[0].name).toBe("Player1");
    expect(payload.comparison.revenue.current).toBeGreaterThanOrEqual(0);
    expect(payload.comparison.orders.current).toBeGreaterThanOrEqual(0);
  });

  it("handles zero yesterday revenue for revenueChange", async () => {
    mockPrisma.adminOrder.findMany.mockResolvedValue([]);
    mockPrisma.adminPlayer.findMany.mockResolvedValue([]);
    mockPrisma.adminOrder.groupBy.mockResolvedValue([]);
    mockPrisma.growthEvent.findMany.mockResolvedValue([]);

    await GET(new Request("http://localhost/api/admin/dashboard"));

    const payload = mockSetCache.mock.calls[0][1];
    expect(payload.realtime.revenueChange).toBe(0);
    expect(payload.comparison.revenue.change).toBe(0);
    expect(payload.comparison.orders.change).toBe(0);
  });

  it("handles funnel with no events (fallback to todayEvents.length)", async () => {
    mockPrisma.adminOrder.findMany.mockResolvedValue([]);
    mockPrisma.adminPlayer.findMany.mockResolvedValue([]);
    mockPrisma.adminOrder.groupBy.mockResolvedValue([]);
    mockPrisma.growthEvent.findMany.mockResolvedValue([
      { event: "other_event", userAddress: null },
    ]);

    await GET(new Request("http://localhost/api/admin/dashboard"));

    const payload = mockSetCache.mock.calls[0][1];
    expect(payload.funnel[0].count).toBe(1);
  });

  it("handles topPlayers with unknown player id", async () => {
    const now = new Date();
    mockPrisma.adminOrder.findMany.mockImplementation(({ where }: { where?: AdminOrderWhere }) => {
      if (where?.createdAt?.gte && !where?.createdAt?.lt) {
        return [
          {
            amount: 100,
            stage: "已完成",
            serviceFee: 10,
            createdAt: now,
            assignedTo: "unknown-player",
            userAddress: "0xabc",
          },
        ];
      }
      return [];
    });
    mockPrisma.adminPlayer.findMany.mockResolvedValue([]);
    mockPrisma.adminOrder.groupBy.mockResolvedValue([]);
    mockPrisma.growthEvent.findMany.mockResolvedValue([]);

    await GET(new Request("http://localhost/api/admin/dashboard"));

    const payload = mockSetCache.mock.calls[0][1];
    expect(payload.topPlayers[0].name).toBe("unknown-player");
  });
});
