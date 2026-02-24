import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
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

vi.mock("@/lib/admin/admin-store-utils", () => ({
  prisma: {
    adminSupportTicket: {
      findMany: mocks.findMany,
    },
  },
}));

import { GET } from "../route";

describe("GET /api/support/my-tickets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when address is missing", async () => {
    const req = new Request("http://localhost/api/support/my-tickets");
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("address required");
  });

  it("returns tickets for address", async () => {
    const now = new Date();
    mocks.findMany.mockResolvedValue([
      {
        id: "T-1",
        topic: "bug",
        message: "help",
        contact: "wechat",
        status: "open",
        reply: null,
        createdAt: now,
      },
    ]);
    const req = new Request("http://localhost/api/support/my-tickets?address=0xabc");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].id).toBe("T-1");
    expect(body.items[0].createdAt).toBe(now.getTime());
  });

  it("returns empty items when no tickets", async () => {
    mocks.findMany.mockResolvedValue([]);
    const req = new Request("http://localhost/api/support/my-tickets?address=0xabc");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
  });
});
