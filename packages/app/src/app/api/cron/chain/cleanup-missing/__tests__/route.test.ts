import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchChainOrdersAdmin: vi.fn(),
  listChainOrdersForCleanup: vi.fn(),
  removeOrders: vi.fn(),
  computeMissingChainCleanup: vi.fn(),
  acquireCronLock: vi.fn(),
  isAuthorizedCron: vi.fn(),
  env: {
    CRON_LOCK_TTL_MS: 60000,
    CHAIN_MISSING_CLEANUP_ENABLED: "1",
    CHAIN_MISSING_CLEANUP_MAX_AGE_HOURS: 48,
    CHAIN_MISSING_CLEANUP_MAX: 100,
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
vi.mock("@/lib/chain/chain-admin", () => ({
  fetchChainOrdersAdmin: mocks.fetchChainOrdersAdmin,
}));
vi.mock("@/lib/admin/admin-store", () => ({
  listChainOrdersForCleanup: mocks.listChainOrdersForCleanup,
  removeOrders: mocks.removeOrders,
}));
vi.mock("@/lib/chain/chain-missing-utils", () => ({
  computeMissingChainCleanup: mocks.computeMissingChainCleanup,
}));
vi.mock("@/lib/cron-lock", () => ({
  acquireCronLock: mocks.acquireCronLock,
}));
vi.mock("@/lib/cron-auth", () => ({
  isAuthorizedCron: mocks.isAuthorizedCron,
}));
vi.mock("@/lib/env", () => ({ env: mocks.env }));

import { GET } from "../route";

function makeReq(url = "http://localhost/api/cron/chain/cleanup-missing") {
  return new Request(url);
}

describe("GET /api/cron/chain/cleanup-missing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.CHAIN_MISSING_CLEANUP_ENABLED = "1";
    mocks.env.CHAIN_MISSING_CLEANUP_MAX_AGE_HOURS = 48;
    mocks.env.CHAIN_MISSING_CLEANUP_MAX = 100;
  });

  it("returns 401 when not authorized", async () => {
    mocks.isAuthorizedCron.mockReturnValue(false);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns 429 when lock cannot be acquired", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(false);
    const res = await GET(makeReq());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("locked");
  });

  it("returns early when disabled", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.env.CHAIN_MISSING_CLEANUP_ENABLED = "0";
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.enabled).toBe(false);
    expect(body.deleted).toBe(0);
    expect(mocks.fetchChainOrdersAdmin).not.toHaveBeenCalled();
  });

  it("returns early when maxAgeHours is invalid", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.env.CHAIN_MISSING_CLEANUP_MAX_AGE_HOURS = 0;
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deleted).toBe(0);
  });

  it("deletes missing orders successfully", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.fetchChainOrdersAdmin.mockResolvedValue([{ id: "c1" }]);
    mocks.listChainOrdersForCleanup.mockResolvedValue([{ id: "l1" }, { id: "l2" }]);
    mocks.computeMissingChainCleanup.mockReturnValue({
      ids: ["l2"],
      missing: [{ id: "l2" }],
      eligible: [{ id: "l2" }],
      cutoff: "2024-01-01",
      limit: 100,
    });
    mocks.removeOrders.mockResolvedValue(1);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deleted).toBe(1);
    expect(body.chainCount).toBe(1);
    expect(body.missingCount).toBe(1);
    expect(body.eligibleCount).toBe(1);
  });

  it("skips removeOrders when no ids to delete", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.fetchChainOrdersAdmin.mockResolvedValue([]);
    mocks.listChainOrdersForCleanup.mockResolvedValue([]);
    mocks.computeMissingChainCleanup.mockReturnValue({
      ids: [],
      missing: [],
      eligible: [],
      cutoff: "2024-01-01",
      limit: 100,
    });
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.deleted).toBe(0);
    expect(mocks.removeOrders).not.toHaveBeenCalled();
  });
});
