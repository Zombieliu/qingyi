import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  getUserLevelProgress: vi.fn(),
  onDailyCheckin: vi.fn(),
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

vi.mock("@/lib/auth/user-auth", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("@/lib/services/growth-service", () => ({
  getUserLevelProgress: mocks.getUserLevelProgress,
  onDailyCheckin: mocks.onDailyCheckin,
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

import { GET, POST } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

describe("GET /api/user/level", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCache.mockReturnValue(null);
    mocks.getIfNoneMatch.mockReturnValue("");
    mocks.computeJsonEtag.mockReturnValue('"etag1"');
  });

  it("returns 400 when userAddress is missing", async () => {
    const req = new Request("http://localhost/api/user/level");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("userAddress required");
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = new Request(`http://localhost/api/user/level?userAddress=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns level progress", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    const progress = { level: 3, points: 150, nextLevel: 200 };
    mocks.getUserLevelProgress.mockResolvedValue(progress);
    const mockRes = { status: 200, json: async () => progress };
    mocks.jsonWithEtag.mockReturnValue(mockRes);
    const req = new Request(`http://localhost/api/user/level?userAddress=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("returns cached data with etag match (304)", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getCache.mockReturnValue({ etag: '"cached"', value: { level: 1 } });
    mocks.getIfNoneMatch.mockReturnValue('"cached"');
    const mock304 = { status: 304 };
    mocks.notModified.mockReturnValue(mock304);
    const req = new Request(`http://localhost/api/user/level?userAddress=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(304);
  });

  it("returns cached data with etag mismatch", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getCache.mockReturnValue({ etag: '"cached"', value: { level: 1 } });
    mocks.getIfNoneMatch.mockReturnValue('"different"');
    const mockRes = { status: 200, json: async () => ({ level: 1 }) };
    mocks.jsonWithEtag.mockReturnValue(mockRes);
    const req = new Request(`http://localhost/api/user/level?userAddress=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    expect(mocks.jsonWithEtag).toHaveBeenCalledWith({ level: 1 }, '"cached"', expect.any(String));
  });
});

describe("POST /api/user/level", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when userAddress is missing", async () => {
    const req = new Request("http://localhost/api/user/level", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = new Request("http://localhost/api/user/level", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAddress: VALID_ADDRESS }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 500 when checkin fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.onDailyCheckin.mockResolvedValue(null);
    const req = new Request("http://localhost/api/user/level", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAddress: VALID_ADDRESS }),
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("returns 409 when already checked in", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.onDailyCheckin.mockResolvedValue({ alreadyCheckedIn: true });
    const req = new Request("http://localhost/api/user/level", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAddress: VALID_ADDRESS }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it("checks in successfully", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.onDailyCheckin.mockResolvedValue({ points: 110, earned: 10, upgraded: false });
    const req = new Request("http://localhost/api/user/level", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userAddress: VALID_ADDRESS }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.earned).toBe(10);
  });

  it("handles invalid JSON body gracefully", async () => {
    const req = new Request("http://localhost/api/user/level", {
      method: "POST",
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
