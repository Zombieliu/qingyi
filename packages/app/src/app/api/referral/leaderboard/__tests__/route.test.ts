import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  getLeaderboard: vi.fn(),
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
  getLeaderboard: mocks.getLeaderboard,
}));

import { GET } from "../route";

describe("GET /api/referral/leaderboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 for invalid type", async () => {
    const req = new Request("http://localhost/api/referral/leaderboard?type=invalid");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid type");
  });

  it("returns 400 for invalid period", async () => {
    const req = new Request("http://localhost/api/referral/leaderboard?period=invalid");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid period");
  });

  it("returns leaderboard with default params", async () => {
    const entries = [{ address: "0x1", score: 100 }];
    mocks.getLeaderboard.mockResolvedValue(entries);
    const req = new Request("http://localhost/api/referral/leaderboard");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.type).toBe("spend");
    expect(body.period).toBe("all");
    expect(body.entries).toEqual(entries);
  });

  it("passes custom type and period", async () => {
    mocks.getLeaderboard.mockResolvedValue([]);
    const req = new Request(
      "http://localhost/api/referral/leaderboard?type=referral&period=week&limit=20"
    );
    await GET(req);
    expect(mocks.getLeaderboard).toHaveBeenCalledWith("referral", "week", 20);
  });
});
