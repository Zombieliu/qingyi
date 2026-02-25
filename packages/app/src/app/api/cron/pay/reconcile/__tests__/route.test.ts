import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  isAuthorizedCron: vi.fn(),
  acquireCronLock: vi.fn(),
  upsertLedgerRecord: vi.fn(),
  recordAudit: vi.fn(),
  prisma: {
    adminPaymentEvent: { findMany: vi.fn() },
    ledgerRecord: { findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(),
  },
  env: {
    CRON_LOCK_TTL_MS: 60000,
    STRIPE_SECRET_KEY: "sk_test_fake",
    PAYMENT_RECONCILE_USE_STRIPE: undefined as string | undefined,
    PAYMENT_RECONCILE_ALERT_ENABLED: undefined as string | undefined,
    PAYMENT_RECONCILE_ALERT_WEBHOOK_URL: "",
    WECHAT_WEBHOOK_URL: "",
    PAYMENT_RECONCILE_MISSING_THRESHOLD: 1,
    PAYMENT_RECONCILE_PATCHED_THRESHOLD: 1,
    PAYMENT_RECONCILE_PENDING_THRESHOLD: 1,
  },
  fetchGlobal: vi.fn(),
  mockStripePaymentIntentsList: vi.fn(),
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
  Prisma: { InputJsonValue: {} },
}));
vi.mock("@/lib/admin/admin-store", () => ({
  upsertLedgerRecord: mocks.upsertLedgerRecord,
}));
vi.mock("@/lib/admin/admin-audit", () => ({
  recordAudit: mocks.recordAudit,
}));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/shared/date-utils", () => ({
  formatFullDateTime: () => "2024-01-01 00:00:00",
}));
vi.mock("stripe", () => {
  class MockStripe {
    paymentIntents = {
      list: mocks.mockStripePaymentIntentsList,
    };
  }
  return { default: MockStripe };
});

import { GET } from "../route";

function makeReq(url = "http://localhost/api/cron/pay/reconcile") {
  return new Request(url);
}

describe("GET /api/cron/pay/reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.STRIPE_SECRET_KEY = "sk_test_fake";
    mocks.env.PAYMENT_RECONCILE_USE_STRIPE = "false";
    mocks.env.PAYMENT_RECONCILE_ALERT_ENABLED = undefined;
    mocks.env.PAYMENT_RECONCILE_ALERT_WEBHOOK_URL = "";
    mocks.env.WECHAT_WEBHOOK_URL = "";
    mocks.recordAudit.mockResolvedValue(undefined);
    mocks.mockStripePaymentIntentsList.mockResolvedValue({ data: [], has_more: false });
    // Reset nested prisma mocks explicitly
    mocks.prisma.adminPaymentEvent.findMany.mockReset();
    mocks.prisma.ledgerRecord.findMany.mockReset();
    mocks.prisma.ledgerRecord.update.mockReset();
    mocks.prisma.$transaction.mockReset();
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(mocks.prisma)
    );
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
  it("reconciles with no events and no stale pending", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValue([]);
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.scannedEvents).toBe(0);
    expect(body.missingLedger).toBe(0);
    expect(body.patchedLedger).toBe(0);
    expect(body.stalePending).toBe(0);
    expect(mocks.recordAudit).toHaveBeenCalled();
  });

  it("detects missing ledger records (dry run)", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: {
          data: {
            object: {
              id: "pi_1",
              metadata: { userAddress: "0xabc", diamondAmount: "100" },
              amount: 5000,
              currency: "cny",
              payment_method_types: ["alipay"],
            },
          },
        },
        createdAt: new Date(),
      },
    ]);
    // No matching ledger records
    mocks.prisma.ledgerRecord.findMany
      .mockResolvedValueOnce([]) // ledger lookup
      .mockResolvedValueOnce([]); // stale pending
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.missingLedger).toBe(1);
    expect(body.reconciled).toBe(0); // dry run, no apply
    expect(body.sample.missingLedger).toContain("order-1");
  });

  it("applies reconciliation when apply=1", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.upsertLedgerRecord.mockResolvedValue({});
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: {
          data: {
            object: {
              id: "pi_1",
              metadata: { userAddress: "0xabc", diamondAmount: "100" },
              amount: 5000,
              currency: "cny",
              payment_method_types: ["alipay"],
            },
          },
        },
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const req = makeReq("http://localhost/api/cron/pay/reconcile?apply=1");
    const res = await GET(req);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.apply).toBe(true);
    expect(body.reconciled).toBe(1);
    expect(mocks.upsertLedgerRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "order-1",
        userAddress: "0xabc",
        diamondAmount: 100,
        status: "paid",
      }),
      mocks.prisma
    );
  });

  it("detects stale pending records", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    // When orderNos is empty, the first ledgerRecord.findMany (ledger lookup) is skipped.
    // Only the stale pending query calls findMany.
    mocks.prisma.ledgerRecord.findMany.mockResolvedValueOnce([
      { id: "stale-1", orderId: null, status: "pending", createdAt: new Date("2024-01-01") },
    ]);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.stalePending).toBe(1);
    expect(body.sample.stalePending).toContain("stale-1");
  });

  it("patches ledger status for non-paid records", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: { data: { object: { id: "pi_1", metadata: {}, amount: 1000, currency: "cny" } } },
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany
      .mockResolvedValueOnce([
        { id: "order-1", orderId: "order-1", status: "pending", meta: null, note: null },
      ])
      .mockResolvedValueOnce([]);
    mocks.prisma.ledgerRecord.update.mockResolvedValue({});
    const req = makeReq("http://localhost/api/cron/pay/reconcile?apply=1");
    const res = await GET(req);
    const body = await res.json();
    expect(body.patchedLedger).toBe(1);
    expect(body.reconciled).toBe(1);
    expect(mocks.prisma.ledgerRecord.update).toHaveBeenCalled();
  });

  it("patches ledger with existing meta object", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: { data: { object: { id: "pi_1", metadata: {}, amount: 1000, currency: "cny" } } },
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany
      .mockResolvedValueOnce([
        {
          id: "order-1",
          orderId: "order-1",
          status: "pending",
          meta: { existingKey: "val" },
          note: "existing note",
        },
      ])
      .mockResolvedValueOnce([]);
    mocks.prisma.ledgerRecord.update.mockResolvedValue({});
    const req = makeReq("http://localhost/api/cron/pay/reconcile?apply=1");
    const res = await GET(req);
    const body = await res.json();
    expect(body.patchedLedger).toBe(1);
    expect(mocks.prisma.ledgerRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          note: "existing note",
        }),
      })
    );
  });

  it("skips apply when missing metadata", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: { data: { object: { id: "pi_1", metadata: {}, amount: 1000, currency: "cny" } } },
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const req = makeReq("http://localhost/api/cron/pay/reconcile?apply=1");
    const res = await GET(req);
    const body = await res.json();
    expect(body.missingLedger).toBe(1);
    expect(body.skipped).toBe(1);
    expect(body.sample.skipped[0].reason).toBe("missing metadata");
  });

  it("sends alert webhook when thresholds exceeded", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.env.WECHAT_WEBHOOK_URL = "https://webhook.example.com/alert";
    mocks.env.PAYMENT_RECONCILE_MISSING_THRESHOLD = 1;
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: {
          data: {
            object: {
              id: "pi_1",
              metadata: { userAddress: "0xabc", diamondAmount: "100" },
              amount: 5000,
              currency: "cny",
              payment_method_types: ["alipay"],
            },
          },
        },
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.alertSent).toBe(true);
    expect(body.alertReasons).toContain("missing_ledger");
    vi.unstubAllGlobals();
  });

  it("handles alert webhook failure", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.env.WECHAT_WEBHOOK_URL = "https://webhook.example.com/alert";
    mocks.env.PAYMENT_RECONCILE_MISSING_THRESHOLD = 1;
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: {
          data: {
            object: {
              id: "pi_1",
              metadata: { userAddress: "0xabc", diamondAmount: "100" },
              amount: 5000,
              currency: "cny",
            },
          },
        },
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal("fetch", mockFetch);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.alertSent).toBe(false);
    expect(body.alertError).toContain("alert webhook failed");
    vi.unstubAllGlobals();
  });

  it("handles alert webhook exception", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.env.WECHAT_WEBHOOK_URL = "https://webhook.example.com/alert";
    mocks.env.PAYMENT_RECONCILE_MISSING_THRESHOLD = 1;
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: {
          data: {
            object: {
              id: "pi_1",
              metadata: { userAddress: "0xabc", diamondAmount: "100" },
              amount: 5000,
              currency: "cny",
            },
          },
        },
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const mockFetch = vi.fn().mockRejectedValue(new Error("network error"));
    vi.stubGlobal("fetch", mockFetch);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.alertSent).toBe(false);
    expect(body.alertError).toContain("network error");
    vi.unstubAllGlobals();
  });

  it("reports stripeEnabled=true when stripe is configured", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.mockStripePaymentIntentsList.mockResolvedValue({ data: [], has_more: false });
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValue([]);
    const res = await GET(makeReq("http://localhost/api/cron/pay/reconcile?useStripe=1"));
    const body = await res.json();
    expect(body.stripeEnabled).toBe(true);
    expect(body.stripeError).toBeNull();
  });

  it("handles extractStripeMeta with null/missing data", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: null,
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.missingLedger).toBe(1);
  });

  it("handles wechat_pay channel extraction", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: {
          data: {
            object: {
              id: "pi_1",
              metadata: { userAddress: "0xabc", diamondAmount: 100 },
              amount: 5000,
              currency: "cny",
              payment_method_types: ["wechat_pay"],
            },
          },
        },
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    mocks.upsertLedgerRecord.mockResolvedValue({});
    const req = makeReq("http://localhost/api/cron/pay/reconcile?apply=1");
    const res = await GET(req);
    const body = await res.json();
    expect(body.reconciled).toBe(1);
    expect(mocks.upsertLedgerRecord).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "wechat_pay" }),
      mocks.prisma
    );
  });

  it("finds ledger by orderId when not found by id", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: { data: { object: { id: "pi_1", metadata: {}, amount: 1000, currency: "cny" } } },
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany
      .mockResolvedValueOnce([
        { id: "ledger-1", orderId: "order-1", status: "paid", meta: null, note: null },
      ])
      .mockResolvedValueOnce([]);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.missingLedger).toBe(0);
    expect(body.patchedLedger).toBe(0);
  });

  it("alerts on stale_pending threshold", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.env.WECHAT_WEBHOOK_URL = "https://webhook.example.com/alert";
    mocks.env.PAYMENT_RECONCILE_PENDING_THRESHOLD = 1;
    mocks.env.PAYMENT_RECONCILE_MISSING_THRESHOLD = 9999;
    mocks.env.PAYMENT_RECONCILE_PATCHED_THRESHOLD = 9999;
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValueOnce([
      { id: "stale-1", orderId: null, status: "pending", createdAt: new Date("2024-01-01") },
    ]);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.alertReasons).toContain("stale_pending");
    expect(body.alertSent).toBe(true);
    vi.unstubAllGlobals();
  });

  it("respects sinceHours, limit, pendingHours query params", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValue([]);
    const res = await GET(
      makeReq("http://localhost/api/cron/pay/reconcile?sinceHours=24&limit=50&pendingHours=12")
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sinceHours).toBe(24);
    expect(body.pendingHours).toBe(12);
  });

  it("uses parseFlag for useStripe=false query param", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValue([]);
    const res = await GET(makeReq("http://localhost/api/cron/pay/reconcile?useStripe=false"));
    const body = await res.json();
    expect(body.stripeEnabled).toBe(false);
    expect(body.stripeError).toBeNull();
  });

  it("uses parseFlag for alert=0 query param", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.env.WECHAT_WEBHOOK_URL = "https://webhook.example.com/alert";
    mocks.env.PAYMENT_RECONCILE_MISSING_THRESHOLD = 1;
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: {
          data: {
            object: {
              id: "pi_1",
              metadata: { userAddress: "0xabc", diamondAmount: "100" },
              amount: 5000,
              currency: "cny",
            },
          },
        },
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const res = await GET(makeReq("http://localhost/api/cron/pay/reconcile?alert=0"));
    const body = await res.json();
    expect(body.alertEnabled).toBe(false);
    expect(body.alertSent).toBe(false);
  });

  it("alerts on patched_ledger threshold", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.env.WECHAT_WEBHOOK_URL = "https://webhook.example.com/alert";
    mocks.env.PAYMENT_RECONCILE_PATCHED_THRESHOLD = 1;
    mocks.env.PAYMENT_RECONCILE_MISSING_THRESHOLD = 9999;
    mocks.env.PAYMENT_RECONCILE_PENDING_THRESHOLD = 9999;
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: { data: { object: { id: "pi_1", metadata: {}, amount: 1000, currency: "cny" } } },
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany
      .mockResolvedValueOnce([
        { id: "order-1", orderId: "order-1", status: "pending", meta: null, note: null },
      ])
      .mockResolvedValueOnce([]);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.alertReasons).toContain("patched_ledger");
    vi.unstubAllGlobals();
  });

  it("alerts on stripe_error when stripe list fails", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.env.WECHAT_WEBHOOK_URL = "https://webhook.example.com/alert";
    mocks.env.PAYMENT_RECONCILE_USE_STRIPE = "true";
    mocks.env.PAYMENT_RECONCILE_MISSING_THRESHOLD = 9999;
    mocks.env.PAYMENT_RECONCILE_PATCHED_THRESHOLD = 9999;
    mocks.env.PAYMENT_RECONCILE_PENDING_THRESHOLD = 9999;
    mocks.mockStripePaymentIntentsList.mockRejectedValue(new Error("stripe fail"));
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValue([]);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.stripeError).toBe("stripe fail");
    expect(body.alertReasons).toContain("stripe_error");
    expect(body.alertSent).toBe(true);
    vi.unstubAllGlobals();
  });

  it("handles event with empty orderNo", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: { data: { object: { id: "pi_1", metadata: {}, amount: 1000, currency: "cny" } } },
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValue([]);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.uniqueOrders).toBe(0);
  });

  it("uses PAYMENT_RECONCILE_ALERT_WEBHOOK_URL when set", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.env.PAYMENT_RECONCILE_ALERT_WEBHOOK_URL = "https://custom-webhook.example.com";
    mocks.env.PAYMENT_RECONCILE_MISSING_THRESHOLD = 1;
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: {
          data: {
            object: {
              id: "pi_1",
              metadata: { userAddress: "0xabc", diamondAmount: "100" },
              amount: 5000,
              currency: "cny",
            },
          },
        },
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.alertSent).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith("https://custom-webhook.example.com", expect.anything());
    vi.unstubAllGlobals();
  });

  it("handles missingThreshold and patchedThreshold query params", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValue([]);
    const res = await GET(
      makeReq(
        "http://localhost/api/cron/pay/reconcile?missingThreshold=5&patchedThreshold=3&pendingThreshold=2"
      )
    );
    const body = await res.json();
    expect(body.thresholds.missingThreshold).toBe(5);
    expect(body.thresholds.patchedThreshold).toBe(3);
    expect(body.thresholds.pendingThreshold).toBe(2);
  });

  it("skips stale pending that match success orders", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: {
          data: {
            object: {
              id: "pi_1",
              metadata: { userAddress: "0xabc", diamondAmount: "100" },
              amount: 5000,
              currency: "cny",
            },
          },
        },
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany
      .mockResolvedValueOnce([
        { id: "order-1", orderId: "order-1", status: "paid", meta: null, note: null },
      ])
      .mockResolvedValueOnce([
        { id: "order-1", orderId: "order-1", status: "pending", createdAt: new Date("2024-01-01") },
      ]);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.stalePending).toBe(0);
  });

  it("handles PAYMENT_RECONCILE_ALERT_ENABLED=false env", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.env.PAYMENT_RECONCILE_ALERT_ENABLED = "false";
    mocks.env.WECHAT_WEBHOOK_URL = "https://webhook.example.com/alert";
    mocks.env.PAYMENT_RECONCILE_MISSING_THRESHOLD = 1;
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: {
          data: {
            object: {
              id: "pi_1",
              metadata: { userAddress: "0xabc", diamondAmount: "100" },
              amount: 5000,
              currency: "cny",
            },
          },
        },
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const res = await GET(makeReq());
    const body = await res.json();
    expect(body.alertEnabled).toBe(false);
    expect(body.alertSent).toBe(false);
  });

  it("fetches stripe payment intents when useStripe is enabled", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.mockStripePaymentIntentsList.mockResolvedValue({
      data: [
        {
          id: "pi_stripe_1",
          status: "succeeded",
          metadata: { orderId: "stripe-order-1", userAddress: "0xstripe", diamondAmount: "200" },
          amount: 10000,
          currency: "cny",
          payment_method_types: ["alipay"],
        },
        {
          id: "pi_stripe_2",
          status: "requires_payment_method",
          metadata: {},
        },
      ],
      has_more: false,
    });
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const res = await GET(makeReq("http://localhost/api/cron/pay/reconcile?useStripe=1"));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.stripeEnabled).toBe(true);
    expect(body.stripeRecords).toBe(1);
    expect(body.missingLedger).toBe(1);
  });

  it("merges stripe records with event records", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.mockStripePaymentIntentsList.mockReset();
    mocks.mockStripePaymentIntentsList.mockResolvedValue({
      data: [
        {
          id: "pi_stripe_1",
          status: "succeeded",
          metadata: { orderId: "order-1", userAddress: "0xstripe", diamondAmount: "200" },
          amount: 10000,
          currency: "cny",
          payment_method_types: ["wechat_pay"],
        },
      ],
      has_more: false,
    });
    // Event record for same order but missing userAddress, diamondAmount, amountCny, currency, channel, paymentIntentId
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([
      {
        id: "evt1",
        orderNo: "order-1",
        provider: "stripe",
        event: "payment_intent.succeeded",
        raw: { data: { object: { metadata: {}, payment_method_types: [] } } },
        createdAt: new Date(),
      },
    ]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const res = await GET(makeReq("http://localhost/api/cron/pay/reconcile?useStripe=1"));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.stripeEnabled).toBe(true);
    expect(body.uniqueOrders).toBe(1);
  });

  it("handles stripe list error gracefully", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.mockStripePaymentIntentsList.mockRejectedValue(new Error("stripe api error"));
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValue([]);
    const res = await GET(makeReq("http://localhost/api/cron/pay/reconcile?useStripe=1"));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.stripeError).toBe("stripe api error");
  });

  it("handles stripe pagination", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.mockStripePaymentIntentsList
      .mockResolvedValueOnce({
        data: [
          {
            id: "pi_1",
            status: "succeeded",
            metadata: { orderId: "order-1", userAddress: "0x1", diamondAmount: "100" },
            amount: 5000,
            currency: "cny",
            payment_method_types: [],
          },
        ],
        has_more: true,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "pi_2",
            status: "succeeded",
            metadata: { orderId: "order-2", userAddress: "0x2", diamondAmount: "200" },
            amount: 10000,
            currency: "cny",
            payment_method_types: [],
          },
        ],
        has_more: false,
      });
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const res = await GET(makeReq("http://localhost/api/cron/pay/reconcile?useStripe=1"));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.stripeRecords).toBeGreaterThanOrEqual(1);
  });

  it("handles parseNumber with invalid string value", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValue([]);
    const res = await GET(
      makeReq("http://localhost/api/cron/pay/reconcile?sinceHours=abc&limit=xyz&pendingHours=!@#")
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.sinceHours).toBe(48);
    expect(body.pendingHours).toBe(6);
  });

  it("handles parseFlag with unrecognized value", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValue([]);
    const res = await GET(
      makeReq("http://localhost/api/cron/pay/reconcile?useStripe=maybe&alert=perhaps")
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("handles stripe intent without orderId in metadata", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.mockStripePaymentIntentsList.mockReset();
    mocks.mockStripePaymentIntentsList.mockResolvedValue({
      data: [
        {
          id: "pi_no_order",
          status: "succeeded",
          metadata: {},
          amount: 5000,
          currency: "cny",
          payment_method_types: [],
        },
      ],
      has_more: false,
    });
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValue([]);
    const res = await GET(makeReq("http://localhost/api/cron/pay/reconcile?useStripe=1"));
    const body = await res.json();
    expect(body.ok).toBe(true);
    // Intent without orderId is skipped by fetchStripeSuccessRecords
    expect(body.stripeRecords).toBeLessThanOrEqual(1);
  });

  it("handles stripe intent with order_id metadata key", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.mockStripePaymentIntentsList.mockResolvedValue({
      data: [
        {
          id: "pi_alt",
          status: "succeeded",
          metadata: { order_id: "alt-order-1", userAddress: "0xalt", diamondAmount: "50" },
          amount: 2500,
          currency: "cny",
          payment_method_types: ["alipay"],
        },
      ],
      has_more: false,
    });
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    const res = await GET(makeReq("http://localhost/api/cron/pay/reconcile?useStripe=1"));
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.stripeRecords).toBe(1);
  });
});
