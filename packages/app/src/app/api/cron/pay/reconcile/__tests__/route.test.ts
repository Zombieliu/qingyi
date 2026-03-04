import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isAuthorizedCron: vi.fn(),
  acquireCronLock: vi.fn(),
  listStripeSucceededPaymentEventsEdgeRead: vi.fn(),
  listLedgerRecordsByOrderIdsEdgeRead: vi.fn(),
  listPendingLedgerRowsBeforeEdgeRead: vi.fn(),
  upsertLedgerRecordEdgeWrite: vi.fn(),
  markLedgerRecordPaidEdgeWrite: vi.fn(),
  recordAudit: vi.fn(),
  env: {
    CRON_LOCK_TTL_MS: 60_000,
    STRIPE_SECRET_KEY: "sk_test_123",
    PAYMENT_RECONCILE_USE_STRIPE: "false",
    PAYMENT_RECONCILE_ALERT_ENABLED: "true",
    PAYMENT_RECONCILE_ALERT_WEBHOOK_URL: "",
    WECHAT_WEBHOOK_URL: "",
    PAYMENT_RECONCILE_MISSING_THRESHOLD: 1,
    PAYMENT_RECONCILE_PATCHED_THRESHOLD: 1,
    PAYMENT_RECONCILE_PENDING_THRESHOLD: 1,
  },
  stripePaymentIntentsList: vi.fn(),
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
vi.mock("@/lib/edge-db/payment-reconcile-store", () => ({
  listStripeSucceededPaymentEventsEdgeRead: mocks.listStripeSucceededPaymentEventsEdgeRead,
  listLedgerRecordsByOrderIdsEdgeRead: mocks.listLedgerRecordsByOrderIdsEdgeRead,
  listPendingLedgerRowsBeforeEdgeRead: mocks.listPendingLedgerRowsBeforeEdgeRead,
  upsertLedgerRecordEdgeWrite: mocks.upsertLedgerRecordEdgeWrite,
  markLedgerRecordPaidEdgeWrite: mocks.markLedgerRecordPaidEdgeWrite,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/shared/date-utils", () => ({ formatFullDateTime: () => "2025/01/01 08:00" }));
vi.mock("stripe", () => ({
  default: class MockStripe {
    paymentIntents = {
      list: mocks.stripePaymentIntentsList,
    };
  },
}));

import { GET } from "../route";

describe("GET /api/cron/pay/reconcile", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.listStripeSucceededPaymentEventsEdgeRead.mockResolvedValue([]);
    mocks.listLedgerRecordsByOrderIdsEdgeRead.mockResolvedValue([]);
    mocks.listPendingLedgerRowsBeforeEdgeRead.mockResolvedValue([]);
    mocks.upsertLedgerRecordEdgeWrite.mockResolvedValue(undefined);
    mocks.markLedgerRecordPaidEdgeWrite.mockResolvedValue(undefined);
    mocks.recordAudit.mockResolvedValue(undefined);
    mocks.stripePaymentIntentsList.mockResolvedValue({ data: [], has_more: false });
    mocks.env.PAYMENT_RECONCILE_USE_STRIPE = "false";
    mocks.env.PAYMENT_RECONCILE_ALERT_ENABLED = "true";
    mocks.env.PAYMENT_RECONCILE_ALERT_WEBHOOK_URL = "";
    mocks.env.WECHAT_WEBHOOK_URL = "";
  });

  it("returns 401 when unauthorized", async () => {
    mocks.isAuthorizedCron.mockReturnValue(false);
    const res = await GET(new Request("http://localhost/api/cron/pay/reconcile"));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  });

  it("returns 429 when lock acquisition fails", async () => {
    mocks.acquireCronLock.mockResolvedValue(false);
    const res = await GET(new Request("http://localhost/api/cron/pay/reconcile"));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "locked" });
  });

  it("reports missing ledger in dry-run", async () => {
    mocks.listStripeSucceededPaymentEventsEdgeRead.mockResolvedValue([
      {
        id: "evt_1",
        orderNo: "order-1",
        raw: {
          data: {
            object: {
              id: "pi_1",
              metadata: { userAddress: "0xabc", diamondAmount: "100" },
              amount: 1000,
              currency: "cny",
            },
          },
        },
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        status: "succeeded",
      },
    ]);

    const res = await GET(new Request("http://localhost/api/cron/pay/reconcile"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.missingLedger).toBe(1);
    expect(body.patchedLedger).toBe(0);
    expect(body.reconciled).toBe(0);
    expect(mocks.upsertLedgerRecordEdgeWrite).not.toHaveBeenCalled();
  });

  it("applies upsert and patch actions when apply=1", async () => {
    mocks.listStripeSucceededPaymentEventsEdgeRead.mockResolvedValue([
      {
        id: "evt_1",
        orderNo: "missing-1",
        raw: {
          data: {
            object: {
              id: "pi_1",
              metadata: { userAddress: "0xabc", diamondAmount: "100" },
              amount: 1000,
              currency: "cny",
            },
          },
        },
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        status: "succeeded",
      },
      {
        id: "evt_2",
        orderNo: "existing-1",
        raw: {
          data: {
            object: {
              id: "pi_2",
              metadata: { userAddress: "0xabc", diamondAmount: "100" },
              amount: 1000,
              currency: "cny",
            },
          },
        },
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        status: "succeeded",
      },
    ]);
    mocks.listLedgerRecordsByOrderIdsEdgeRead.mockResolvedValue([
      {
        id: "existing-1",
        orderId: "existing-1",
        status: "pending",
        note: null,
        meta: { a: 1 },
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
      },
    ]);

    const res = await GET(new Request("http://localhost/api/cron/pay/reconcile?apply=1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reconciled).toBe(2);
    expect(body.missingLedger).toBe(1);
    expect(body.patchedLedger).toBe(1);
    expect(mocks.upsertLedgerRecordEdgeWrite).toHaveBeenCalledTimes(1);
    expect(mocks.markLedgerRecordPaidEdgeWrite).toHaveBeenCalledTimes(1);
  });

  it("sends alert webhook when thresholds are exceeded", async () => {
    mocks.env.WECHAT_WEBHOOK_URL = "https://webhook.example.com";
    mocks.env.PAYMENT_RECONCILE_MISSING_THRESHOLD = 1;
    mocks.listStripeSucceededPaymentEventsEdgeRead.mockResolvedValue([
      {
        id: "evt_1",
        orderNo: "missing-1",
        raw: {
          data: {
            object: {
              id: "pi_1",
              metadata: { userAddress: "0xabc", diamondAmount: "100" },
              amount: 1000,
              currency: "cny",
            },
          },
        },
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        status: "succeeded",
      },
    ]);

    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    const res = await GET(new Request("http://localhost/api/cron/pay/reconcile"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alertSent).toBe(true);
    expect(body.alertReasons).toContain("missing_ledger");

    vi.unstubAllGlobals();
  });
});
