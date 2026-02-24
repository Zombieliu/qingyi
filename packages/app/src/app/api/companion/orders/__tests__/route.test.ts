import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
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
vi.mock("@/lib/db", () => ({
  prisma: {
    adminOrder: {
      count: mocks.count,
      findMany: mocks.findMany,
    },
  },
}));

import { GET } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

describe("GET /api/companion/orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when address is missing", async () => {
    const req = new Request("http://localhost/api/companion/orders");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = new Request(`http://localhost/api/companion/orders?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns orders with status=completed filter", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    const now = new Date();
    mocks.count.mockResolvedValue(1);
    mocks.findMany.mockResolvedValue([
      {
        id: "ORD-2",
        user: "u1",
        userAddress: "0x1",
        item: "item1",
        amount: 100,
        stage: "已完成",
        serviceFee: 10,
        chainStatus: null,
        createdAt: now,
        updatedAt: null,
        note: null,
        meta: null,
      },
    ]);
    const req = new Request(
      `http://localhost/api/companion/orders?address=${VALID_ADDRESS}&status=completed`
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0].updatedAt).toBeNull();
  });

  it("returns orders with status=all (no stage filter)", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.count.mockResolvedValue(0);
    mocks.findMany.mockResolvedValue([]);
    const req = new Request(
      `http://localhost/api/companion/orders?address=${VALID_ADDRESS}&status=all`
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orders).toEqual([]);
  });

  it("returns orders for companion", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    const now = new Date();
    mocks.count.mockResolvedValue(1);
    mocks.findMany.mockResolvedValue([
      {
        id: "ORD-1",
        user: "u1",
        userAddress: "0x1",
        item: "item1",
        amount: 100,
        stage: "进行中",
        serviceFee: 10,
        chainStatus: null,
        createdAt: now,
        updatedAt: now,
        note: null,
        meta: null,
      },
    ]);
    const req = new Request(`http://localhost/api/companion/orders?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orders).toHaveLength(1);
    expect(body.total).toBe(1);
    expect(body.orders[0].createdAt).toBe(now.getTime());
  });
});
