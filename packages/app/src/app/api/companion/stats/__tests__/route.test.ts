import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  getCompanionStatsEdgeRead: vi.fn(),
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
vi.mock("@/lib/edge-db/companion-read-store", () => ({
  getCompanionStatsEdgeRead: mocks.getCompanionStatsEdgeRead,
}));

import { GET } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

describe("GET /api/companion/stats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when address is missing", async () => {
    const req = new Request("http://localhost/api/companion/stats");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = new Request(`http://localhost/api/companion/stats?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns stats for companion", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getCompanionStatsEdgeRead.mockResolvedValue({
      totalStats: { _count: { id: 5 }, _sum: { amount: 500, serviceFee: 50 } },
      monthStats: { _count: { id: 2 }, _sum: { amount: 200, serviceFee: 20 } },
      todayStats: { _count: { id: 1 }, _sum: { amount: 100 } },
      activeOrders: 2,
      reviews: { _avg: { rating: 4.5 }, _count: { id: 6 } },
      player: {
        id: "P-1",
        name: "Test",
        status: "可接单",
        role: "companion",
      },
    });
    const req = new Request(`http://localhost/api/companion/stats?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.player).toBeDefined();
    expect(body.total).toBeDefined();
    expect(body.activeOrders).toBeDefined();
  });

  it("returns null player when not found", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getCompanionStatsEdgeRead.mockResolvedValue({
      totalStats: { _count: { id: 0 }, _sum: { amount: null, serviceFee: null } },
      monthStats: { _count: { id: 0 }, _sum: { amount: null, serviceFee: null } },
      todayStats: { _count: { id: 0 }, _sum: { amount: null } },
      activeOrders: 0,
      reviews: { _avg: { rating: null }, _count: { id: 0 } },
      player: null,
    });
    const req = new Request(`http://localhost/api/companion/stats?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.player).toBeNull();
    expect(body.rating.avg).toBeNull();
    expect(body.total.orders).toBe(0);
    expect(body.total.revenue).toBe(0);
    expect(body.today.orders).toBe(0);
    expect(body.month.orders).toBe(0);
  });

  it("handles null _count.id values", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getCompanionStatsEdgeRead.mockResolvedValue({
      totalStats: { _count: { id: null }, _sum: { amount: null, serviceFee: null } },
      monthStats: { _count: { id: null }, _sum: { amount: null, serviceFee: null } },
      todayStats: { _count: { id: null }, _sum: { amount: null } },
      activeOrders: 0,
      reviews: { _avg: { rating: null }, _count: { id: null } },
      player: null,
    });
    const req = new Request(`http://localhost/api/companion/stats?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total.orders).toBe(0);
    expect(body.total.revenue).toBe(0);
    expect(body.total.serviceFee).toBe(0);
    expect(body.month.orders).toBe(0);
    expect(body.month.revenue).toBe(0);
    expect(body.month.serviceFee).toBe(0);
    expect(body.today.orders).toBe(0);
    expect(body.today.revenue).toBe(0);
    expect(body.rating.avg).toBeNull();
    expect(body.rating.count).toBe(0);
  });
});
