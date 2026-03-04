import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getCache: vi.fn(),
  setCache: vi.fn(),
  computeJsonEtag: vi.fn(),
  getIfNoneMatch: vi.fn(),
  jsonWithEtag: vi.fn(),
  notModified: vi.fn(),
  getPlayerByIdOrAddressEdgeRead: vi.fn(),
  listPlayerReviewsByAddressEdgeRead: vi.fn(),
  getPlayerReviewStatsEdgeRead: vi.fn(),
}));

vi.mock("next/server", () => {
  class MockNextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map();
    }
    async json() {
      return this.body;
    }
    static json(data: unknown, init?: { status?: number }) {
      return new MockNextResponse(data, init);
    }
  }
  return { NextResponse: MockNextResponse };
});

vi.mock("@/lib/edge-db/user-read-store", () => ({
  getPlayerByIdOrAddressEdgeRead: mocks.getPlayerByIdOrAddressEdgeRead,
  listPlayerReviewsByAddressEdgeRead: mocks.listPlayerReviewsByAddressEdgeRead,
  getPlayerReviewStatsEdgeRead: mocks.getPlayerReviewStatsEdgeRead,
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

describe("GET /api/players/:playerId/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCache.mockReturnValue(null);
    mocks.getIfNoneMatch.mockReturnValue("");
    mocks.computeJsonEtag.mockReturnValue('"etag1"');
  });

  it("returns 404 when player not found", async () => {
    mocks.getPlayerByIdOrAddressEdgeRead.mockResolvedValue(null);
    const req = new Request("http://localhost/api/players/P-MISSING/reviews");
    const res = await GET(req, { params: Promise.resolve({ playerId: "P-MISSING" }) });
    expect(res.status).toBe(404);
  });

  it("returns reviews for player", async () => {
    mocks.getPlayerByIdOrAddressEdgeRead.mockResolvedValue({
      id: "P-1",
      name: "Test",
      address: "0xabc",
      role: "companion",
      status: "可接单",
    });
    const now = Date.parse("2026-03-01T00:00:00.000Z");
    mocks.listPlayerReviewsByAddressEdgeRead.mockResolvedValue([
      { id: "R-1", rating: 5, content: "Great", tags: ["friendly"], createdAt: now },
    ]);
    mocks.getPlayerReviewStatsEdgeRead.mockResolvedValue({ avgRating: 5, totalReviews: 1 });
    const mockRes = {
      status: 200,
      json: async () => ({ player: {}, stats: {}, reviews: [] }),
    };
    mocks.jsonWithEtag.mockReturnValue(mockRes);
    const req = new Request("http://localhost/api/players/P-1/reviews");
    const res = await GET(req, { params: Promise.resolve({ playerId: "P-1" }) });
    expect(res.status).toBe(200);
    expect(mocks.setCache).toHaveBeenCalled();
  });

  it("returns 304 when etag matches", async () => {
    mocks.getPlayerByIdOrAddressEdgeRead.mockResolvedValue({
      id: "P-1",
      name: "Test",
      address: "0xabc",
      role: "companion",
      status: "可接单",
    });
    mocks.getCache.mockReturnValue({ etag: '"cached"', value: {} });
    mocks.getIfNoneMatch.mockReturnValue('"cached"');
    const mock304 = { status: 304 };
    mocks.notModified.mockReturnValue(mock304);
    const req = new Request("http://localhost/api/players/P-1/reviews");
    const res = await GET(req, { params: Promise.resolve({ playerId: "P-1" }) });
    expect(res.status).toBe(304);
  });

  it("returns 404 when player has no address", async () => {
    mocks.getPlayerByIdOrAddressEdgeRead.mockResolvedValue({
      id: "P-1",
      name: "Test",
      address: undefined,
      role: "companion",
      status: "可接单",
    });
    const req = new Request("http://localhost/api/players/P-1/reviews");
    const res = await GET(req, { params: Promise.resolve({ playerId: "P-1" }) });
    expect(res.status).toBe(404);
  });

  it("returns cached data when etag does not match", async () => {
    mocks.getPlayerByIdOrAddressEdgeRead.mockResolvedValue({
      id: "P-1",
      name: "Test",
      address: "0xabc",
      role: "companion",
      status: "可接单",
    });
    mocks.getCache.mockReturnValue({ etag: '"cached"', value: { reviews: [] } });
    mocks.getIfNoneMatch.mockReturnValue('"different"');
    const mockRes = { status: 200, json: async () => ({ reviews: [] }) };
    mocks.jsonWithEtag.mockReturnValue(mockRes);
    const req = new Request("http://localhost/api/players/P-1/reviews");
    const res = await GET(req, { params: Promise.resolve({ playerId: "P-1" }) });
    expect(res.status).toBe(200);
  });

  it("computes tag counts and rating distribution", async () => {
    mocks.getPlayerByIdOrAddressEdgeRead.mockResolvedValue({
      id: "P-1",
      name: "Test",
      address: "0xabc",
      role: "companion",
      status: "可接单",
    });
    const now = Date.parse("2026-03-01T00:00:00.000Z");
    mocks.listPlayerReviewsByAddressEdgeRead.mockResolvedValue([
      { id: "R-1", rating: 5, content: "Great", tags: ["friendly", "skilled"], createdAt: now },
      { id: "R-2", rating: 4, content: "Good", tags: ["friendly"], createdAt: now },
      { id: "R-3", rating: 2, content: "OK", tags: null, createdAt: now },
    ]);
    mocks.getPlayerReviewStatsEdgeRead.mockResolvedValue({ avgRating: 3.67, totalReviews: 3 });
    mocks.jsonWithEtag.mockImplementation((data: unknown) => ({
      status: 200,
      json: async () => data,
    }));
    const req = new Request("http://localhost/api/players/P-1/reviews");
    const res = await GET(req, { params: Promise.resolve({ playerId: "P-1" }) });
    const body = await res.json();
    expect(body.stats.avgRating).toBe(3.7);
    expect(body.stats.totalReviews).toBe(3);
    expect(body.stats.topTags).toHaveLength(2);
    expect(body.stats.ratingDistribution[4]).toBe(1);
    expect(body.stats.ratingDistribution[3]).toBe(1);
    expect(body.stats.positiveRate).toBeGreaterThan(0);
  });

  it("handles null avg rating", async () => {
    mocks.getPlayerByIdOrAddressEdgeRead.mockResolvedValue({
      id: "P-1",
      name: "Test",
      address: "0xabc",
      role: "companion",
      status: "可接单",
    });
    mocks.listPlayerReviewsByAddressEdgeRead.mockResolvedValue([]);
    mocks.getPlayerReviewStatsEdgeRead.mockResolvedValue({ avgRating: null, totalReviews: 0 });
    mocks.jsonWithEtag.mockImplementation((data: unknown) => ({
      status: 200,
      json: async () => data,
    }));
    const req = new Request("http://localhost/api/players/P-1/reviews");
    const res = await GET(req, { params: Promise.resolve({ playerId: "P-1" }) });
    const body = await res.json();
    expect(body.stats.avgRating).toBeNull();
    expect(body.stats.positiveRate).toBe(0);
  });
});
