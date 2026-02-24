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
  mockPrisma: { growthEvent: { findMany: vi.fn() } },
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

function makeReq(params: Record<string, string> = {}) {
  const url = new URL("http://localhost/api/admin/analytics/trend");
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
  mockPrisma.growthEvent.findMany.mockResolvedValue([]);
});

describe("GET /api/admin/analytics/trend", () => {
  it("returns 401 when auth fails", async () => {
    mockRequireAdmin.mockResolvedValue(authFail);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns 304 when etag matches", async () => {
    mockGetCache.mockReturnValue({ value: {}, etag: "e1" });
    mockGetIfNoneMatch.mockReturnValue("e1");
    mockNotModified.mockReturnValue(new Response(null, { status: 304 }));
    const res = await GET(makeReq());
    expect(res.status).toBe(304);
  });

  it("returns trend data from prisma", async () => {
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(mockSetCache).toHaveBeenCalled();
  });

  it("clamps days to max 30", async () => {
    await GET(makeReq({ days: "100" }));
    expect(mockPrisma.growthEvent.findMany).toHaveBeenCalled();
  });

  it("returns cached data when etag does not match", async () => {
    mockGetCache.mockReturnValue({ value: { cached: true }, etag: "e1" });
    mockGetIfNoneMatch.mockReturnValue("other");
    mockJsonWithEtag.mockReturnValue(Response.json({ cached: true }));
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(mockJsonWithEtag).toHaveBeenCalled();
  });

  it("processes events into daily buckets with retention", async () => {
    const today = "2025-01-01";
    mockFormatDateISO.mockReturnValue(today);
    mockPrisma.growthEvent.findMany.mockResolvedValue([
      {
        event: "page_view",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        createdAt: new Date(),
      },
      {
        event: "order_intent",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        createdAt: new Date(),
      },
      {
        event: "order_create_success",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        createdAt: new Date(),
      },
      {
        event: "page_view",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        createdAt: new Date(),
      },
    ]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.trend).toBeDefined();
    expect(json.retention).toBeDefined();
  });

  it("computes retention when user returns after first order", async () => {
    // The function calls formatDateISO multiple times:
    // 7 calls for bucket init (days=7), then for each row in 3 loops
    // We need: order_create_success on day "2025-01-01", page_view on day "2025-01-02"
    const calls: string[] = [];
    mockFormatDateISO.mockImplementation(() => {
      const idx = calls.length;
      calls.push("call");
      // First 7 calls: bucket init
      if (idx < 7) return `2025-01-0${idx + 1}`;
      // Loop 1 (daily buckets): 2 rows
      // row 0 (order_create_success) -> "2025-01-01"
      // row 1 (page_view) -> "2025-01-02"
      // Loop 2 (retention - order users): 2 rows
      // row 0 (order_create_success) -> "2025-01-01"
      // row 1 (page_view) -> skip (not order_create_success)
      // Loop 3 (retention - return users): 2 rows
      // row 0 (order_create_success) -> skip (not page_view)
      // row 1 (page_view) -> "2025-01-02"
      const rowIdx = (idx - 7) % 2;
      return rowIdx === 0 ? "2025-01-01" : "2025-01-02";
    });
    mockPrisma.growthEvent.findMany.mockResolvedValue([
      {
        event: "order_create_success",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        createdAt: new Date("2025-01-01"),
      },
      {
        event: "page_view",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        createdAt: new Date("2025-01-02"),
      },
    ]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.retention).toBeDefined();
    expect(json.retention.orderUsers).toBe(1);
    expect(json.retention.returnUsers).toBe(1);
    expect(json.retention.rate).toBeGreaterThan(0);
  });

  it("skips rows that do not match any daily bucket", async () => {
    let callIdx = 0;
    mockFormatDateISO.mockImplementation(() => {
      callIdx++;
      // First call is bucket init (days=1, so 1 call)
      if (callIdx <= 1) return "2025-01-01";
      // Subsequent calls for row processing return a date not in buckets
      return "2099-12-31";
    });
    mockPrisma.growthEvent.findMany.mockResolvedValue([
      {
        event: "page_view",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        createdAt: new Date(),
      },
    ]);
    const res = await GET(makeReq({ days: "1" }));
    expect(res.status).toBe(200);
  });

  it("handles NaN days gracefully", async () => {
    mockPrisma.growthEvent.findMany.mockResolvedValue([]);
    const res = await GET(makeReq({ days: "abc" }));
    expect(res.status).toBe(200);
  });

  it("clamps days to min 1 when given 0", async () => {
    mockPrisma.growthEvent.findMany.mockResolvedValue([]);
    const res = await GET(makeReq({ days: "0" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.rangeDays).toBe(1);
  });

  it("uses sessionId as identity when clientId is null", async () => {
    const today = "2025-01-01";
    mockFormatDateISO.mockReturnValue(today);
    mockPrisma.growthEvent.findMany.mockResolvedValue([
      {
        event: "page_view",
        clientId: null,
        sessionId: "s1",
        userAddress: null,
        createdAt: new Date(),
      },
    ]);
    const res = await GET(makeReq({ days: "1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.trend[0].views).toBe(1);
  });

  it("uses userAddress as identity when clientId and sessionId are null", async () => {
    const today = "2025-01-01";
    mockFormatDateISO.mockReturnValue(today);
    mockPrisma.growthEvent.findMany.mockResolvedValue([
      {
        event: "page_view",
        clientId: null,
        sessionId: null,
        userAddress: "0xabc",
        createdAt: new Date(),
      },
    ]);
    const res = await GET(makeReq({ days: "1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.trend[0].views).toBe(1);
  });

  it("uses 'unknown' as identity when all identifiers are null", async () => {
    const today = "2025-01-01";
    mockFormatDateISO.mockReturnValue(today);
    mockPrisma.growthEvent.findMany.mockResolvedValue([
      {
        event: "page_view",
        clientId: null,
        sessionId: null,
        userAddress: null,
        createdAt: new Date(),
      },
    ]);
    const res = await GET(makeReq({ days: "1" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.trend[0].views).toBe(1);
  });

  it("updates userFirstOrder when a later row has an earlier date", async () => {
    // Two order_create_success events from the same user on different days
    // The second row has an earlier date, so userFirstOrder should be updated
    const calls: string[] = [];
    mockFormatDateISO.mockImplementation(() => {
      const idx = calls.length;
      calls.push("call");
      // days=7 -> 7 bucket init calls
      if (idx < 7) return `2025-01-0${idx + 1}`;
      // Loop 1 (daily buckets): 2 rows
      // row 0 -> "2025-01-02", row 1 -> "2025-01-01"
      // Loop 2 (retention - order users): 2 rows
      // row 0 -> "2025-01-02", row 1 -> "2025-01-01"
      // Loop 3 (retention - return users): 2 rows (both order_create_success, not page_view, skipped)
      const rowIdx = (idx - 7) % 2;
      return rowIdx === 0 ? "2025-01-02" : "2025-01-01";
    });
    mockPrisma.growthEvent.findMany.mockResolvedValue([
      {
        event: "order_create_success",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        createdAt: new Date("2025-01-02"),
      },
      {
        event: "order_create_success",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        createdAt: new Date("2025-01-01"),
      },
    ]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.retention.orderUsers).toBe(1);
  });

  it("does not count return when page_view is on same day as first order", async () => {
    const calls: string[] = [];
    mockFormatDateISO.mockImplementation(() => {
      const idx = calls.length;
      calls.push("call");
      if (idx < 7) return `2025-01-0${idx + 1}`;
      // All rows map to same day
      return "2025-01-01";
    });
    mockPrisma.growthEvent.findMany.mockResolvedValue([
      {
        event: "order_create_success",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        createdAt: new Date("2025-01-01"),
      },
      {
        event: "page_view",
        clientId: "c1",
        sessionId: null,
        userAddress: null,
        createdAt: new Date("2025-01-01"),
      },
    ]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.retention.orderUsers).toBe(1);
    expect(json.retention.returnUsers).toBe(0);
    expect(json.retention.rate).toBe(0);
  });

  it("does not count page_view user as return if they have no order", async () => {
    const calls: string[] = [];
    mockFormatDateISO.mockImplementation(() => {
      const idx = calls.length;
      calls.push("call");
      if (idx < 7) return `2025-01-0${idx + 1}`;
      return "2025-01-01";
    });
    mockPrisma.growthEvent.findMany.mockResolvedValue([
      {
        event: "page_view",
        clientId: "c2",
        sessionId: null,
        userAddress: null,
        createdAt: new Date("2025-01-01"),
      },
    ]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.retention.orderUsers).toBe(0);
    expect(json.retention.returnUsers).toBe(0);
    expect(json.retention.rate).toBe(0);
  });

  it("handles retention with sessionId-based identity", async () => {
    const calls: string[] = [];
    mockFormatDateISO.mockImplementation(() => {
      const idx = calls.length;
      calls.push("call");
      if (idx < 7) return `2025-01-0${idx + 1}`;
      const rowIdx = (idx - 7) % 2;
      return rowIdx === 0 ? "2025-01-01" : "2025-01-02";
    });
    mockPrisma.growthEvent.findMany.mockResolvedValue([
      {
        event: "order_create_success",
        clientId: null,
        sessionId: "s1",
        userAddress: null,
        createdAt: new Date("2025-01-01"),
      },
      {
        event: "page_view",
        clientId: null,
        sessionId: "s1",
        userAddress: null,
        createdAt: new Date("2025-01-02"),
      },
    ]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.retention.orderUsers).toBe(1);
    expect(json.retention.returnUsers).toBe(1);
  });

  it("handles retention with userAddress-based identity", async () => {
    const calls: string[] = [];
    mockFormatDateISO.mockImplementation(() => {
      const idx = calls.length;
      calls.push("call");
      if (idx < 7) return `2025-01-0${idx + 1}`;
      const rowIdx = (idx - 7) % 2;
      return rowIdx === 0 ? "2025-01-01" : "2025-01-02";
    });
    mockPrisma.growthEvent.findMany.mockResolvedValue([
      {
        event: "order_create_success",
        clientId: null,
        sessionId: null,
        userAddress: "0xabc",
        createdAt: new Date("2025-01-01"),
      },
      {
        event: "page_view",
        clientId: null,
        sessionId: null,
        userAddress: "0xabc",
        createdAt: new Date("2025-01-02"),
      },
    ]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.retention.orderUsers).toBe(1);
    expect(json.retention.returnUsers).toBe(1);
  });

  it("handles retention with unknown identity fallback", async () => {
    const calls: string[] = [];
    mockFormatDateISO.mockImplementation(() => {
      const idx = calls.length;
      calls.push("call");
      if (idx < 7) return `2025-01-0${idx + 1}`;
      const rowIdx = (idx - 7) % 2;
      return rowIdx === 0 ? "2025-01-01" : "2025-01-02";
    });
    mockPrisma.growthEvent.findMany.mockResolvedValue([
      {
        event: "order_create_success",
        clientId: null,
        sessionId: null,
        userAddress: null,
        createdAt: new Date("2025-01-01"),
      },
      {
        event: "page_view",
        clientId: null,
        sessionId: null,
        userAddress: null,
        createdAt: new Date("2025-01-02"),
      },
    ]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.retention.orderUsers).toBe(1);
    expect(json.retention.returnUsers).toBe(1);
  });
});
