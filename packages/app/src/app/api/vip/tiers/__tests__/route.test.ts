import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  listActiveMembershipTiersEdgeRead: vi.fn(),
  getCache: vi.fn(),
  setCache: vi.fn(),
  computeJsonEtag: vi.fn(),
  getIfNoneMatch: vi.fn(),
  jsonWithEtag: vi.fn(),
  notModified: vi.fn(),
}));

vi.mock("@/lib/edge-db/public-read-store", () => ({
  listActiveMembershipTiersEdgeRead: mocks.listActiveMembershipTiersEdgeRead,
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

describe("GET /api/vip/tiers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCache.mockReturnValue(null);
    mocks.getIfNoneMatch.mockReturnValue("");
    mocks.computeJsonEtag.mockReturnValue('"etag1"');
  });

  it("returns tiers from store", async () => {
    const tiers = [{ id: "T-1", name: "Gold" }];
    mocks.listActiveMembershipTiersEdgeRead.mockResolvedValue(tiers);
    const mockRes = { status: 200, json: async () => tiers };
    mocks.jsonWithEtag.mockReturnValue(mockRes);
    const req = new Request("http://localhost/api/vip/tiers");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mocks.setCache).toHaveBeenCalled();
  });

  it("returns cached data with etag match (304)", async () => {
    mocks.getCache.mockReturnValue({ etag: '"cached"', value: [{ id: "T-1" }] });
    mocks.getIfNoneMatch.mockReturnValue('"cached"');
    const mock304 = { status: 304 };
    mocks.notModified.mockReturnValue(mock304);
    const req = new Request("http://localhost/api/vip/tiers");
    const res = await GET(req);
    expect(res.status).toBe(304);
  });

  it("returns cached data when etag does not match", async () => {
    mocks.getCache.mockReturnValue({ etag: '"cached"', value: [{ id: "T-1" }] });
    mocks.getIfNoneMatch.mockReturnValue('"other"');
    const mockRes = { status: 200, json: async () => [{ id: "T-1" }] };
    mocks.jsonWithEtag.mockReturnValue(mockRes);
    const req = new Request("http://localhost/api/vip/tiers");
    const res = await GET(req);
    expect(res.status).toBe(200);
  });
});
