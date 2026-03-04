import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: {
    STRIPE_SECRET_KEY: "sk_test_123",
    STRIPE_WEBHOOK_SECRET: undefined as string | undefined,
  },
  createPaymentEventEdgeWrite: vi.fn(),
  getOrderExistsByIdEdgeRead: vi.fn(),
  updateOrderPaymentStatusEdgeWrite: vi.fn(),
  upsertLedgerRecordEdgeWrite: vi.fn(),
  recordAudit: vi.fn(),
  publishOrderEvent: vi.fn(),
  stripeConstructEvent: vi.fn(),
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

  return {
    NextResponse: MockNextResponse,
    after: (task: unknown) => task,
  };
});

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/edge-db/payment-reconcile-store", () => ({
  createPaymentEventEdgeWrite: mocks.createPaymentEventEdgeWrite,
  getOrderExistsByIdEdgeRead: mocks.getOrderExistsByIdEdgeRead,
  updateOrderPaymentStatusEdgeWrite: mocks.updateOrderPaymentStatusEdgeWrite,
  upsertLedgerRecordEdgeWrite: mocks.upsertLedgerRecordEdgeWrite,
}));
vi.mock("@/lib/admin/admin-audit", () => ({ recordAudit: mocks.recordAudit }));
vi.mock("@/lib/realtime", () => ({ publishOrderEvent: mocks.publishOrderEvent }));
vi.mock("stripe", () => ({
  default: class MockStripe {
    webhooks = {
      constructEvent: mocks.stripeConstructEvent,
    };
  },
}));

import { POST } from "../route";

function makeRequest(payload: unknown, headers?: HeadersInit) {
  return new Request("http://localhost/api/pay/webhook", {
    method: "POST",
    headers,
    body: typeof payload === "string" ? payload : JSON.stringify(payload),
  });
}

function makeEvent(type = "payment_intent.succeeded", metadata: Record<string, string> = {}) {
  return {
    id: `evt_${Date.now()}`,
    type,
    data: {
      object: {
        id: "pi_123",
        object: "payment_intent",
        amount: 1000,
        status: "succeeded",
        metadata,
      },
    },
  };
}

describe("POST /api/pay/webhook", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.env.STRIPE_SECRET_KEY = "sk_test_123";
    mocks.env.STRIPE_WEBHOOK_SECRET = undefined;
    mocks.createPaymentEventEdgeWrite.mockResolvedValue(undefined);
    mocks.getOrderExistsByIdEdgeRead.mockResolvedValue(true);
    mocks.updateOrderPaymentStatusEdgeWrite.mockResolvedValue(undefined);
    mocks.upsertLedgerRecordEdgeWrite.mockResolvedValue(undefined);
    mocks.recordAudit.mockResolvedValue(undefined);
    mocks.publishOrderEvent.mockResolvedValue(undefined);
    vi.unstubAllEnvs();
  });

  it("returns 503 in production when webhook secret is missing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await POST(makeRequest("{}"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("webhook_secret_required");
  });

  it("returns 400 when body is invalid json and no webhook secret", async () => {
    const res = await POST(
      new Request("http://localhost/api/pay/webhook", { method: "POST", body: "{invalid" })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_json");
  });

  it("returns 401 when webhook signature is invalid", async () => {
    mocks.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mocks.stripeConstructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });

    const res = await POST(makeRequest("{}", { "stripe-signature": "sig_test" }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("invalid_signature");
  });

  it("mutates order and ledger when verified paid and pricing matches", async () => {
    mocks.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const event = makeEvent("payment_intent.succeeded", {
      orderId: "ORD-1",
      userAddress: "0xabc",
      diamondAmount: "100",
    });
    mocks.stripeConstructEvent.mockReturnValue(event);

    const res = await POST(makeRequest(event, { "stripe-signature": "sig_test" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, verified: true });
    expect(mocks.createPaymentEventEdgeWrite).toHaveBeenCalled();
    expect(mocks.getOrderExistsByIdEdgeRead).toHaveBeenCalledWith("ORD-1");
    expect(mocks.updateOrderPaymentStatusEdgeWrite).toHaveBeenCalledWith("ORD-1", "已支付");
    expect(mocks.upsertLedgerRecordEdgeWrite).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ORD-1", userAddress: "0xabc", diamondAmount: 100 })
    );
    expect(mocks.publishOrderEvent).toHaveBeenCalled();
    expect(mocks.recordAudit).toHaveBeenCalled();
  });

  it("does not mutate order/ledger when pricing mismatches", async () => {
    mocks.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const event = makeEvent("payment_intent.succeeded", {
      orderId: "ORD-1",
      userAddress: "0xabc",
      diamondAmount: "999",
    });
    mocks.stripeConstructEvent.mockReturnValue(event);

    const res = await POST(makeRequest(event, { "stripe-signature": "sig_test" }));
    expect(res.status).toBe(200);
    expect(mocks.updateOrderPaymentStatusEdgeWrite).not.toHaveBeenCalled();
    expect(mocks.upsertLedgerRecordEdgeWrite).not.toHaveBeenCalled();
  });

  it("records event but skips mutation when not verified", async () => {
    const event = makeEvent("payment_intent.succeeded", {
      orderId: "ORD-1",
      userAddress: "0xabc",
      diamondAmount: "100",
    });

    const res = await POST(makeRequest(event));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, verified: false });
    expect(mocks.createPaymentEventEdgeWrite).toHaveBeenCalled();
    expect(mocks.updateOrderPaymentStatusEdgeWrite).not.toHaveBeenCalled();
    expect(mocks.upsertLedgerRecordEdgeWrite).not.toHaveBeenCalled();
  });
});
