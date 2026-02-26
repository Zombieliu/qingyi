import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  syncChainOrders: vi.fn(),
  acquireCronLock: vi.fn(),
  isAuthorizedCron: vi.fn(),
  trackCronFailed: vi.fn(),
  env: {
    CRON_LOCK_TTL_MS: 60000,
  },
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
vi.mock("@/lib/chain/chain-sync", () => ({
  syncChainOrders: mocks.syncChainOrders,
}));
vi.mock("@/lib/cron-lock", () => ({
  acquireCronLock: mocks.acquireCronLock,
}));
vi.mock("@/lib/cron-auth", () => ({
  isAuthorizedCron: mocks.isAuthorizedCron,
}));
vi.mock("@/lib/business-events", () => ({
  trackCronFailed: mocks.trackCronFailed,
}));
vi.mock("@/lib/env", () => ({ env: mocks.env }));

import { GET } from "../route";

function makeReq(url: string, headers?: Record<string, string>) {
  return new Request(url, { headers });
}

describe("GET /api/cron/chain-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authorized", async () => {
    mocks.isAuthorizedCron.mockReturnValue(false);
    const req = makeReq("http://localhost/api/cron/chain-sync");
    const res = await GET(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 429 when lock cannot be acquired", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(false);
    const req = makeReq("http://localhost/api/cron/chain-sync");
    const res = await GET(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("locked");
  });

  it("syncs chain orders successfully", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.syncChainOrders.mockResolvedValue({ synced: 5, total: 10 });
    const req = makeReq("http://localhost/api/cron/chain-sync");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.synced).toBe(5);
    expect(body.total).toBe(10);
  });

  it("returns 500 when sync fails", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.syncChainOrders.mockRejectedValue(new Error("RPC timeout"));
    const req = makeReq("http://localhost/api/cron/chain-sync");
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("sync failed");
  });

  it("tracks cron failure on error", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.syncChainOrders.mockRejectedValue(new Error("network error"));
    const req = makeReq("http://localhost/api/cron/chain-sync");
    await GET(req);
    expect(mocks.trackCronFailed).toHaveBeenCalledWith("chain-sync", "network error");
  });

  it("calls acquireCronLock with correct params", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.syncChainOrders.mockResolvedValue({});
    const req = makeReq("http://localhost/api/cron/chain-sync");
    await GET(req);
    expect(mocks.acquireCronLock).toHaveBeenCalledWith("chain-sync", 60000);
  });

  it("accepts vercel cron header", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.syncChainOrders.mockResolvedValue({ synced: 0 });
    const req = makeReq("http://localhost/api/cron/chain-sync", { "x-vercel-cron": "1" });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("handles sync returning empty result", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.syncChainOrders.mockResolvedValue({});
    const req = makeReq("http://localhost/api/cron/chain-sync");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("handles error without message", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.syncChainOrders.mockRejectedValue({});
    const req = makeReq("http://localhost/api/cron/chain-sync");
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("sync failed");
    expect(mocks.trackCronFailed).toHaveBeenCalledWith("chain-sync", "sync failed");
  });
});
