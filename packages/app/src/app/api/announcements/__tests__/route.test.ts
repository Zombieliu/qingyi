import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  listPublicAnnouncements: vi.fn(),
  getCache: vi.fn(),
  setCache: vi.fn(),
  computeJsonEtag: vi.fn(),
  getIfNoneMatch: vi.fn(),
  jsonWithEtag: vi.fn(),
  notModified: vi.fn(),
}));

vi.mock("@/lib/admin/admin-store", () => ({
  listPublicAnnouncements: mocks.listPublicAnnouncements,
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

describe("GET /api/announcements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCache.mockReturnValue(null);
    mocks.getIfNoneMatch.mockReturnValue("");
    mocks.computeJsonEtag.mockReturnValue('"etag1"');
  });

  it("returns announcements from store", async () => {
    const announcements = [{ id: "A-1", title: "Hello" }];
    mocks.listPublicAnnouncements.mockResolvedValue(announcements);
    const mockRes = { status: 200, json: async () => announcements };
    mocks.jsonWithEtag.mockReturnValue(mockRes);
    const req = new Request("http://localhost/api/announcements");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mocks.setCache).toHaveBeenCalled();
  });

  it("returns 304 when etag matches", async () => {
    mocks.getCache.mockReturnValue({ etag: '"cached"', value: [] });
    mocks.getIfNoneMatch.mockReturnValue('"cached"');
    const mock304 = { status: 304 };
    mocks.notModified.mockReturnValue(mock304);
    const req = new Request("http://localhost/api/announcements");
    const res = await GET(req);
    expect(res.status).toBe(304);
  });

  it("returns cached data when etag does not match", async () => {
    mocks.getCache.mockReturnValue({ etag: '"cached"', value: [{ id: "A-1" }] });
    mocks.getIfNoneMatch.mockReturnValue('"different"');
    const mockRes = { status: 200, json: async () => [{ id: "A-1" }] };
    mocks.jsonWithEtag.mockReturnValue(mockRes);
    const req = new Request("http://localhost/api/announcements");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mocks.jsonWithEtag).toHaveBeenCalledWith(
      [{ id: "A-1" }],
      '"cached"',
      expect.any(String)
    );
  });
});
