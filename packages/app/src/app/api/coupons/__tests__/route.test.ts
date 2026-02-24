import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  listActiveCoupons: vi.fn(),
  getCache: vi.fn(),
  setCache: vi.fn(),
  computeJsonEtag: vi.fn(),
  getIfNoneMatch: vi.fn(),
  jsonWithEtag: vi.fn(),
  notModified: vi.fn(),
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

vi.mock("@/lib/admin/admin-store", () => ({
  listActiveCoupons: mocks.listActiveCoupons,
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

function createMockRequest(url: string, headers?: Record<string, string>) {
  return new Request(url, { headers });
}

describe("GET /api/coupons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCache.mockReturnValue(null);
    mocks.getIfNoneMatch.mockReturnValue("");
    mocks.computeJsonEtag.mockReturnValue('"etag1"');
  });

  it("returns fresh coupons when no cache", async () => {
    const coupons = [{ id: "c1", code: "SAVE10", discount: 10 }];
    mocks.listActiveCoupons.mockResolvedValue(coupons);
    const mockRes = { status: 200, json: async () => coupons };
    mocks.jsonWithEtag.mockReturnValue(mockRes);
    const req = createMockRequest("http://localhost/api/coupons");
    const res = await GET(req);
    expect(mocks.listActiveCoupons).toHaveBeenCalled();
    expect(mocks.setCache).toHaveBeenCalledWith("api:coupons:active", coupons, 30000, '"etag1"');
    expect(mocks.jsonWithEtag).toHaveBeenCalledWith(coupons, '"etag1"', expect.any(String));
  });

  it("returns cached coupons when cache hit and no etag match", async () => {
    const cached = { etag: '"cached-etag"', value: [{ id: "c1" }] };
    mocks.getCache.mockReturnValue(cached);
    mocks.getIfNoneMatch.mockReturnValue("");
    const mockRes = { status: 200, json: async () => cached.value };
    mocks.jsonWithEtag.mockReturnValue(mockRes);
    const req = createMockRequest("http://localhost/api/coupons");
    const res = await GET(req);
    expect(mocks.listActiveCoupons).not.toHaveBeenCalled();
    expect(mocks.jsonWithEtag).toHaveBeenCalledWith(
      cached.value,
      '"cached-etag"',
      expect.any(String)
    );
  });

  it("returns 304 when etag matches", async () => {
    const cached = { etag: '"match-etag"', value: [{ id: "c1" }] };
    mocks.getCache.mockReturnValue(cached);
    mocks.getIfNoneMatch.mockReturnValue('"match-etag"');
    const mock304 = { status: 304 };
    mocks.notModified.mockReturnValue(mock304);
    const req = createMockRequest("http://localhost/api/coupons", {
      "if-none-match": '"match-etag"',
    });
    const res = await GET(req);
    expect(res.status).toBe(304);
    expect(mocks.notModified).toHaveBeenCalledWith('"match-etag"', expect.any(String));
  });

  it("fetches from store when cache has no etag", async () => {
    mocks.getCache.mockReturnValue(null);
    const coupons = [{ id: "c2" }];
    mocks.listActiveCoupons.mockResolvedValue(coupons);
    const mockRes = { status: 200, json: async () => coupons };
    mocks.jsonWithEtag.mockReturnValue(mockRes);
    const req = createMockRequest("http://localhost/api/coupons");
    await GET(req);
    expect(mocks.listActiveCoupons).toHaveBeenCalled();
  });

  it("returns empty array when no active coupons", async () => {
    mocks.listActiveCoupons.mockResolvedValue([]);
    const mockRes = { status: 200, json: async () => [] };
    mocks.jsonWithEtag.mockReturnValue(mockRes);
    const req = createMockRequest("http://localhost/api/coupons");
    await GET(req);
    expect(mocks.setCache).toHaveBeenCalledWith("api:coupons:active", [], 30000, '"etag1"');
  });

  it("computes etag from fresh data", async () => {
    const coupons = [{ id: "c3", code: "NEW" }];
    mocks.listActiveCoupons.mockResolvedValue(coupons);
    mocks.computeJsonEtag.mockReturnValue('"new-etag"');
    const mockRes = { status: 200 };
    mocks.jsonWithEtag.mockReturnValue(mockRes);
    const req = createMockRequest("http://localhost/api/coupons");
    await GET(req);
    expect(mocks.computeJsonEtag).toHaveBeenCalledWith(coupons);
    expect(mocks.jsonWithEtag).toHaveBeenCalledWith(coupons, '"new-etag"', expect.any(String));
  });

  it("sets correct cache TTL", async () => {
    mocks.listActiveCoupons.mockResolvedValue([]);
    mocks.jsonWithEtag.mockReturnValue({ status: 200 });
    const req = createMockRequest("http://localhost/api/coupons");
    await GET(req);
    expect(mocks.setCache).toHaveBeenCalledWith(
      "api:coupons:active",
      expect.anything(),
      30000,
      expect.any(String)
    );
  });

  it("uses correct cache key", async () => {
    mocks.listActiveCoupons.mockResolvedValue([]);
    mocks.jsonWithEtag.mockReturnValue({ status: 200 });
    const req = createMockRequest("http://localhost/api/coupons");
    await GET(req);
    expect(mocks.getCache).toHaveBeenCalledWith("api:coupons:active");
  });

  it("returns cached value directly when etag does not match", async () => {
    const cached = { etag: '"old-etag"', value: [{ id: "c1" }] };
    mocks.getCache.mockReturnValue(cached);
    mocks.getIfNoneMatch.mockReturnValue('"different-etag"');
    const mockRes = { status: 200 };
    mocks.jsonWithEtag.mockReturnValue(mockRes);
    const req = createMockRequest("http://localhost/api/coupons");
    await GET(req);
    expect(mocks.jsonWithEtag).toHaveBeenCalledWith(cached.value, '"old-etag"', expect.any(String));
    expect(mocks.listActiveCoupons).not.toHaveBeenCalled();
  });

  it("handles multiple coupons correctly", async () => {
    const coupons = [
      { id: "c1", code: "A" },
      { id: "c2", code: "B" },
      { id: "c3", code: "C" },
    ];
    mocks.listActiveCoupons.mockResolvedValue(coupons);
    mocks.jsonWithEtag.mockReturnValue({ status: 200 });
    const req = createMockRequest("http://localhost/api/coupons");
    await GET(req);
    expect(mocks.setCache).toHaveBeenCalledWith("api:coupons:active", coupons, 30000, '"etag1"');
  });
});
