import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  queryCompanionDuoOrdersEdgeRead: vi.fn(),
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
  queryCompanionDuoOrdersEdgeRead: mocks.queryCompanionDuoOrdersEdgeRead,
}));

import { GET } from "../route";

const VALID_ADDRESS = "0x" + "b".repeat(64);

describe("GET /api/companion/duo-orders", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when address is missing", async () => {
    const req = new Request("http://localhost/api/companion/duo-orders");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("address required");
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = new Request(`http://localhost/api/companion/duo-orders?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns duo orders with completed filter", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.queryCompanionDuoOrdersEdgeRead.mockResolvedValue({
      total: 1,
      rows: [
        {
          id: "DUO-1",
          user: "u1",
          userAddress: "0xuser",
          companionAddressA: VALID_ADDRESS,
          companionAddressB: null,
          item: "duo",
          amount: 188,
          stage: "已完成",
          serviceFee: 18,
          depositPerCompanion: 50,
          teamStatus: 3,
          chainStatus: 1,
          createdAt: 1_700_000_000_000,
          updatedAt: null,
          note: null,
          meta: { duoOrder: true },
        },
      ],
    });

    const req = new Request(
      `http://localhost/api/companion/duo-orders?address=${VALID_ADDRESS}&status=completed`
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.orders).toHaveLength(1);
    expect(body.orders[0].id).toBe("DUO-1");
    expect(body.total).toBe(1);
    expect(body.totalPages).toBe(1);
    expect(mocks.queryCompanionDuoOrdersEdgeRead).toHaveBeenCalledWith({
      address: VALID_ADDRESS,
      status: "completed",
      page: 1,
      pageSize: 20,
    });
  });

  it("returns paged metadata for custom page and page size", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.queryCompanionDuoOrdersEdgeRead.mockResolvedValue({ total: 31, rows: [] });

    const req = new Request(
      `http://localhost/api/companion/duo-orders?address=${VALID_ADDRESS}&page=2&pageSize=15&status=all`
    );
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.orders).toEqual([]);
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(15);
    expect(body.total).toBe(31);
    expect(body.totalPages).toBe(3);
    expect(mocks.queryCompanionDuoOrdersEdgeRead).toHaveBeenCalledWith({
      address: VALID_ADDRESS,
      status: "all",
      page: 2,
      pageSize: 15,
    });
  });
});
