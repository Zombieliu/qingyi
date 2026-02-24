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
  mockFormatDateISO,
} = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  mockPrisma: { adminOrder: { findMany: vi.fn() } },
  mockGetCache: vi.fn(),
  mockSetCache: vi.fn(),
  mockComputeJsonEtag: vi.fn(),
  mockGetIfNoneMatch: vi.fn(),
  mockJsonWithEtag: vi.fn(),
  mockNotModified: vi.fn(),
  mockFormatDateISO: vi.fn(),
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
vi.mock("@/lib/shared/date-utils", () => ({ formatDateISO: mockFormatDateISO }));

import { GET } from "../route";

const authOk = { ok: true, role: "admin", authType: "session" };
const authFail = { ok: false, response: Response.json({ error: "Unauthorized" }, { status: 401 }) };

function makeGet(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/revenue");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockGetCache.mockReturnValue(null);
  mockComputeJsonEtag.mockReturnValue("etag-1");
  mockJsonWithEtag.mockImplementation((data: unknown) => Response.json(data));
  mockFormatDateISO.mockReturnValue("2025-01-01");
  mockPrisma.adminOrder.findMany.mockResolvedValue([]);
});

describe("GET /api/admin/revenue", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeGet());
    expect(res.status).toBe(401);
  });

  it("returns 304 when etag matches", async () => {
    mockGetCache.mockReturnValue({ value: {}, etag: "e1" });
    mockGetIfNoneMatch.mockReturnValue("e1");
    mockNotModified.mockReturnValue(new Response(null, { status: 304 }));
    const res = await GET(makeGet());
    expect(res.status).toBe(304);
  });

  it("returns revenue data", async () => {
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    expect(mockSetCache).toHaveBeenCalled();
  });

  it("returns cached data when etag does not match", async () => {
    mockGetCache.mockReturnValue({ value: { cached: true }, etag: "e1" });
    mockGetIfNoneMatch.mockReturnValue("other");
    mockJsonWithEtag.mockReturnValue(Response.json({ cached: true }));
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    expect(mockJsonWithEtag).toHaveBeenCalled();
  });

  it("aggregates revenue by source and item", async () => {
    mockFormatDateISO.mockReturnValue("2025-01-01");
    mockPrisma.adminOrder.findMany.mockResolvedValue([
      {
        amount: 100,
        currency: "CNY",
        stage: "已完成",
        item: "陪练",
        source: "web",
        serviceFee: 10,
        createdAt: new Date(),
      },
      {
        amount: 200,
        currency: "CNY",
        stage: "已完成",
        item: "陪练",
        source: "app",
        serviceFee: 20,
        createdAt: new Date(),
      },
      {
        amount: 50,
        currency: "CNY",
        stage: "已取消",
        item: "陪练",
        source: "web",
        serviceFee: 5,
        createdAt: new Date(),
      },
      {
        amount: 300,
        currency: "CNY",
        stage: "已完成",
        item: "代练",
        source: null,
        serviceFee: 0,
        createdAt: new Date(),
      },
    ]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary.completedOrders).toBe(3);
    expect(json.summary.cancelledOrders).toBe(1);
    expect(json.summary.totalOrders).toBe(4);
    expect(json.bySource.length).toBeGreaterThanOrEqual(2);
    expect(json.byItem.length).toBeGreaterThanOrEqual(1);
  });
});
