import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  listPlayersPublicEdgeRead: vi.fn(),
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

vi.mock("server-only", () => ({}));
vi.mock("@/lib/edge-db/user-read-store", () => ({
  listPlayersPublicEdgeRead: mocks.listPlayersPublicEdgeRead,
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

function makeReq(url: string, headers?: Record<string, string>) {
  return new Request(url, { headers });
}

describe("GET /api/players", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCache.mockReturnValue(null);
    mocks.getIfNoneMatch.mockReturnValue("");
    mocks.computeJsonEtag.mockReturnValue('"etag123"');
  });

  it("returns available players from store", async () => {
    const players = [
      { id: "P1", name: "Alice", role: "陪玩", status: "可接单", depositBase: 0, depositLocked: 0 },
      { id: "P2", name: "Bob", role: "陪玩", status: "忙碌", depositBase: 0, depositLocked: 0 },
    ];
    mocks.listPlayersPublicEdgeRead.mockResolvedValue(players);
    const mockRes = {
      status: 200,
      json: async () => [{ id: "P1", name: "Alice", role: "陪玩", status: "可接单" }],
    };
    mocks.jsonWithEtag.mockReturnValue(mockRes);
    const req = makeReq("http://localhost/api/players");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mocks.listPlayersPublicEdgeRead).toHaveBeenCalled();
  });

  it("returns cached data when available", async () => {
    const cachedPayload = [{ id: "P1", name: "Alice", role: "陪玩", status: "可接单" }];
    mocks.getCache.mockReturnValue({ value: cachedPayload, etag: '"cached-etag"' });
    const mockRes = { status: 200, json: async () => cachedPayload };
    mocks.jsonWithEtag.mockReturnValue(mockRes);
    const req = makeReq("http://localhost/api/players");
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mocks.listPlayersPublicEdgeRead).not.toHaveBeenCalled();
  });

  it("returns 304 when etag matches", async () => {
    mocks.getCache.mockReturnValue({ value: [], etag: '"etag123"' });
    mocks.getIfNoneMatch.mockReturnValue('"etag123"');
    const mockRes = { status: 304 };
    mocks.notModified.mockReturnValue(mockRes);
    const req = makeReq("http://localhost/api/players", { "if-none-match": '"etag123"' });
    const res = await GET(req);
    expect(res.status).toBe(304);
  });

  it("filters out players with insufficient deposit", async () => {
    const players = [
      { id: "P1", name: "Alice", status: "可接单", depositBase: 100, depositLocked: 50 },
      { id: "P2", name: "Bob", status: "可接单", depositBase: 100, depositLocked: 100 },
    ];
    mocks.listPlayersPublicEdgeRead.mockResolvedValue(players);
    mocks.jsonWithEtag.mockImplementation((data: unknown) => ({
      status: 200,
      json: async () => data,
    }));
    const req = makeReq("http://localhost/api/players");
    const res = await GET(req);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("P2");
  });

  it("sets cache after fetching from store", async () => {
    mocks.listPlayersPublicEdgeRead.mockResolvedValue([]);
    mocks.jsonWithEtag.mockReturnValue({ status: 200 });
    const req = makeReq("http://localhost/api/players");
    await GET(req);
    expect(mocks.setCache).toHaveBeenCalledWith(
      "api:players:available",
      expect.any(Array),
      5000,
      expect.any(String)
    );
  });

  it("includes players with zero depositBase", async () => {
    const players = [
      { id: "P1", name: "Alice", status: "可接单", depositBase: 0, depositLocked: 0 },
    ];
    mocks.listPlayersPublicEdgeRead.mockResolvedValue(players);
    mocks.jsonWithEtag.mockImplementation((data: unknown) => ({
      status: 200,
      json: async () => data,
    }));
    const req = makeReq("http://localhost/api/players");
    const res = await GET(req);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });

  it("includes players with null depositBase", async () => {
    const players = [
      { id: "P1", name: "Alice", status: "可接单", depositBase: null, depositLocked: null },
    ];
    mocks.listPlayersPublicEdgeRead.mockResolvedValue(players);
    mocks.jsonWithEtag.mockImplementation((data: unknown) => ({
      status: 200,
      json: async () => data,
    }));
    const req = makeReq("http://localhost/api/players");
    const res = await GET(req);
    const body = await res.json();
    expect(body).toHaveLength(1);
  });
});
