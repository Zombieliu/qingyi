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
  mockPrisma: {
    adminOrder: { findMany: vi.fn() },
    orderReview: { findMany: vi.fn() },
    adminPlayer: { findMany: vi.fn() },
  },
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

function makeGet(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/performance");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url.toString());
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAdmin.mockResolvedValue(authOk);
  mockGetCache.mockReturnValue(null);
  mockComputeJsonEtag.mockReturnValue("etag-1");
  mockJsonWithEtag.mockImplementation((data: unknown) => Response.json(data));
  mockPrisma.adminOrder.findMany.mockResolvedValue([]);
  mockPrisma.orderReview.findMany.mockResolvedValue([]);
  mockPrisma.adminPlayer.findMany.mockResolvedValue([]);
});

describe("GET /api/admin/performance", () => {
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

  it("returns performance data", async () => {
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

  it("aggregates orders and reviews by companion", async () => {
    mockPrisma.adminPlayer.findMany.mockResolvedValue([
      { id: "p1", name: "Player1", address: "0xAddr1" },
      { id: "p2", name: "Player2", address: "0xAddr2" },
    ]);
    mockPrisma.adminOrder.findMany.mockResolvedValue([
      { assignedTo: "p1", companionAddress: "0xAddr1", stage: "已完成", amount: 100, id: "o1" },
      { assignedTo: "p1", companionAddress: "0xAddr1", stage: "已取消", amount: 50, id: "o2" },
      { assignedTo: "p2", companionAddress: "0xAddr2", stage: "已完成", amount: 200, id: "o3" },
      {
        assignedTo: "unknown-id",
        companionAddress: "0xUnknown",
        stage: "已完成",
        amount: 30,
        id: "o4",
      },
    ]);
    mockPrisma.orderReview.findMany.mockResolvedValue([
      { companionAddress: "0xAddr1", rating: 5 },
      { companionAddress: "0xAddr1", rating: 4 },
      { companionAddress: "0xAddr2", rating: 3 },
      { companionAddress: "0xNoMatch", rating: 5 },
    ]);
    const res = await GET(makeGet());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.performance).toBeDefined();
    expect(json.performance.length).toBeGreaterThanOrEqual(2);
    const p1 = json.performance.find((p: { playerId: string }) => p.playerId === "p1");
    expect(p1).toBeDefined();
    expect(p1.total).toBe(2);
    expect(p1.completed).toBe(1);
    expect(p1.cancelled).toBe(1);
    expect(p1.avgRating).toBeDefined();
    expect(p1.reviewCount).toBe(2);
  });
});
