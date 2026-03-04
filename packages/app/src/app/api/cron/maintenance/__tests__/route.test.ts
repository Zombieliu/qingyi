import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAuthorizedCron: vi.fn(),
  acquireCronLock: vi.fn(),
  pruneTableByMaxRowsEdgeWrite: vi.fn(),
  deleteAdminOrdersBeforeEdgeWrite: vi.fn(),
  env: {
    CRON_LOCK_TTL_MS: 60_000,
    ADMIN_AUDIT_LOG_LIMIT: 1_000,
    ADMIN_PAYMENT_EVENT_LIMIT: 500,
    ORDER_RETENTION_DAYS: 90,
  },
}));

vi.mock("next/server", () => {
  class MockNextResponse {
    body: unknown;
    status: number;
    constructor(body: unknown, init?: { status?: number }) {
      this.body = body;
      this.status = init?.status ?? 200;
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

vi.mock("@/lib/cron-auth", () => ({ isAuthorizedCron: mocks.isAuthorizedCron }));
vi.mock("@/lib/cron-lock", () => ({ acquireCronLock: mocks.acquireCronLock }));
vi.mock("@/lib/edge-db/cron-maintenance-store", () => ({
  pruneTableByMaxRowsEdgeWrite: mocks.pruneTableByMaxRowsEdgeWrite,
  deleteAdminOrdersBeforeEdgeWrite: mocks.deleteAdminOrdersBeforeEdgeWrite,
}));
vi.mock("@/lib/env", () => ({ env: mocks.env }));

import { GET } from "../route";

describe("GET /api/cron/maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.ADMIN_AUDIT_LOG_LIMIT = 1_000;
    mocks.env.ADMIN_PAYMENT_EVENT_LIMIT = 500;
    mocks.env.ORDER_RETENTION_DAYS = 90;
    mocks.pruneTableByMaxRowsEdgeWrite.mockResolvedValue(0);
    mocks.deleteAdminOrdersBeforeEdgeWrite.mockResolvedValue(0);
  });

  it("returns 401 when unauthorized", async () => {
    mocks.isAuthorizedCron.mockReturnValue(false);
    const res = await GET(new Request("http://localhost/api/cron/maintenance"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 429 when lock cannot be acquired", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(false);

    const res = await GET(new Request("http://localhost/api/cron/maintenance"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "locked" });
  });

  it("prunes edge tables and deletes old orders", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.pruneTableByMaxRowsEdgeWrite.mockResolvedValueOnce(12).mockResolvedValueOnce(5);
    mocks.deleteAdminOrdersBeforeEdgeWrite.mockResolvedValue(3);

    const res = await GET(new Request("http://localhost/api/cron/maintenance"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      deletedAudit: 12,
      deletedPayments: 5,
      deletedOrders: 3,
    });
    expect(mocks.pruneTableByMaxRowsEdgeWrite).toHaveBeenNthCalledWith(1, "AdminAuditLog", 1000);
    expect(mocks.pruneTableByMaxRowsEdgeWrite).toHaveBeenNthCalledWith(2, "AdminPaymentEvent", 500);
    expect(mocks.deleteAdminOrdersBeforeEdgeWrite).toHaveBeenCalledTimes(1);
  });

  it("skips order deletion when retention is not positive finite", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.env.ORDER_RETENTION_DAYS = 0;

    const res = await GET(new Request("http://localhost/api/cron/maintenance"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deletedOrders).toBe(0);
    expect(mocks.deleteAdminOrdersBeforeEdgeWrite).not.toHaveBeenCalled();
  });
});
