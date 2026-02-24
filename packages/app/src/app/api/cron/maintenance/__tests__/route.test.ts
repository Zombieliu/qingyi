import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  isAuthorizedCron: vi.fn(),
  acquireCronLock: vi.fn(),
  prisma: {
    adminAuditLog: {
      count: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    adminPaymentEvent: {
      count: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    adminOrder: {
      deleteMany: vi.fn(),
    },
  },
  env: {
    CRON_LOCK_TTL_MS: 60000,
    ADMIN_AUDIT_LOG_LIMIT: 1000,
    ADMIN_PAYMENT_EVENT_LIMIT: 500,
    ORDER_RETENTION_DAYS: 90,
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
vi.mock("@/lib/cron-auth", () => ({
  isAuthorizedCron: mocks.isAuthorizedCron,
}));
vi.mock("@/lib/cron-lock", () => ({
  acquireCronLock: mocks.acquireCronLock,
}));
vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma,
}));
vi.mock("@/lib/env", () => ({ env: mocks.env }));

import { GET } from "../route";

function makeReq(url = "http://localhost/api/cron/maintenance") {
  return new Request(url);
}

describe("GET /api/cron/maintenance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.ADMIN_AUDIT_LOG_LIMIT = 1000;
    mocks.env.ADMIN_PAYMENT_EVENT_LIMIT = 500;
    mocks.env.ORDER_RETENTION_DAYS = 90;
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

  it("prunes audit logs and payment events", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    // audit log: 1200 total, limit 1000 => 200 excess
    mocks.prisma.adminAuditLog.count.mockResolvedValue(1200);
    mocks.prisma.adminAuditLog.findMany.mockResolvedValue(
      Array.from({ length: 200 }, (_, i) => ({ id: `a${i}` }))
    );
    mocks.prisma.adminAuditLog.deleteMany.mockResolvedValue({});
    // payment events: 300 total, limit 500 => no excess
    mocks.prisma.adminPaymentEvent.count.mockResolvedValue(300);
    // orders
    mocks.prisma.adminOrder.deleteMany.mockResolvedValue({ count: 5 });

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deletedAudit).toBe(200);
    expect(body.deletedPayments).toBe(0);
    expect(body.deletedOrders).toBe(5);
  });

  it("skips order deletion when retention days is 0", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.env.ORDER_RETENTION_DAYS = 0;
    mocks.prisma.adminAuditLog.count.mockResolvedValue(0);
    mocks.prisma.adminPaymentEvent.count.mockResolvedValue(0);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deletedOrders).toBe(0);
    expect(mocks.prisma.adminOrder.deleteMany).not.toHaveBeenCalled();
  });

  it("handles no excess records gracefully", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminAuditLog.count.mockResolvedValue(500);
    mocks.prisma.adminPaymentEvent.count.mockResolvedValue(100);
    mocks.prisma.adminOrder.deleteMany.mockResolvedValue({ count: 0 });

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deletedAudit).toBe(0);
    expect(body.deletedPayments).toBe(0);
    expect(body.deletedOrders).toBe(0);
  });

  it("skips order deletion when retention days is negative", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.env.ORDER_RETENTION_DAYS = -1;
    mocks.prisma.adminAuditLog.count.mockResolvedValue(0);
    mocks.prisma.adminPaymentEvent.count.mockResolvedValue(0);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.deletedOrders).toBe(0);
    expect(mocks.prisma.adminOrder.deleteMany).not.toHaveBeenCalled();
  });

  it("skips order deletion when retention days is Infinity", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.env.ORDER_RETENTION_DAYS = Infinity;
    mocks.prisma.adminAuditLog.count.mockResolvedValue(0);
    mocks.prisma.adminPaymentEvent.count.mockResolvedValue(0);

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.deletedOrders).toBe(0);
  });

  it("handles prune when findMany returns empty array", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminAuditLog.count.mockResolvedValue(1200);
    mocks.prisma.adminAuditLog.findMany.mockResolvedValue([]);
    mocks.prisma.adminPaymentEvent.count.mockResolvedValue(0);
    mocks.prisma.adminOrder.deleteMany.mockResolvedValue({ count: 0 });

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deletedAudit).toBe(0);
  });

  it("handles prune with non-finite max limit", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.env.ADMIN_AUDIT_LOG_LIMIT = Infinity;
    mocks.env.ADMIN_PAYMENT_EVENT_LIMIT = -1;
    mocks.prisma.adminOrder.deleteMany.mockResolvedValue({ count: 0 });

    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.deletedAudit).toBe(0);
    expect(body.deletedPayments).toBe(0);
  });
});
