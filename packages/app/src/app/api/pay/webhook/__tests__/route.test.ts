import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockAddPaymentEvent,
  mockGetOrderById,
  mockUpdateOrder,
  mockUpsertLedgerRecord,
  mockRecordAudit,
  mockConstructEvent,
  mockEnv,
  mockPrisma,
} = vi.hoisted(() => {
  const prisma = {
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
  };
  return {
    mockAddPaymentEvent: vi.fn(),
    mockGetOrderById: vi.fn(),
    mockUpdateOrder: vi.fn(),
    mockUpsertLedgerRecord: vi.fn(),
    mockRecordAudit: vi.fn(),
    mockConstructEvent: vi.fn(),
    mockEnv: {
      STRIPE_SECRET_KEY: "sk_test_initial" as string | undefined,
      STRIPE_WEBHOOK_SECRET: undefined as string | undefined,
      LEDGER_ADMIN_TOKEN: undefined as string | undefined,
    },
    mockPrisma: prisma,
  };
});

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/admin/admin-store", () => ({
  addPaymentEvent: mockAddPaymentEvent,
  getOrderById: mockGetOrderById,
  updateOrder: mockUpdateOrder,
  upsertLedgerRecord: mockUpsertLedgerRecord,
}));

vi.mock("@/lib/admin/admin-audit", () => ({
  recordAudit: mockRecordAudit,
}));

vi.mock("@/lib/env", () => ({
  env: mockEnv,
}));

vi.mock("stripe", () => {
  return {
    default: class MockStripe {
      webhooks = { constructEvent: mockConstructEvent };
    },
  };
});

import { POST } from "../route";
function makeWebhookRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/pay/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function makeStripeEvent(
  type: string,
  metadata: Record<string, string> = {},
  overrides: Record<string, unknown> = {}
) {
  return {
    id: `evt_${Date.now()}`,
    type,
    data: {
      object: {
        id: "pi_test123",
        object: "payment_intent",
        amount: 9900,
        status: "succeeded",
        metadata,
        ...overrides,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAddPaymentEvent.mockResolvedValue(undefined);
  mockRecordAudit.mockResolvedValue(undefined);
});

// ─── POST /api/pay/webhook ─────────────────────────────
describe("POST /api/pay/webhook", () => {
  it("returns 503 in production when webhook secret is missing", async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    mockEnv.STRIPE_WEBHOOK_SECRET = undefined;
    const req = makeWebhookRequest({ type: "test" });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.error).toBe("webhook_secret_required");
    process.env.NODE_ENV = origEnv;
  });

  it("verifies signature when webhook secret is set", async () => {
    mockEnv.STRIPE_WEBHOOK_SECRET = "whsec_test";
    const event = makeStripeEvent("payment_intent.created");
    mockConstructEvent.mockReturnValue(event);
    const req = makeWebhookRequest(event, { "stripe-signature": "sig_test" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.verified).toBe(true);
    expect(mockConstructEvent).toHaveBeenCalled();
    mockEnv.STRIPE_WEBHOOK_SECRET = undefined;
  });

  it("returns 401 for invalid signature when webhook secret is set", async () => {
    mockEnv.STRIPE_WEBHOOK_SECRET = "whsec_test";
    mockConstructEvent.mockImplementation(() => {
      throw new Error("invalid sig");
    });
    const req = makeWebhookRequest({ type: "test" }, { "stripe-signature": "bad_sig" });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("invalid_signature");
    mockEnv.STRIPE_WEBHOOK_SECRET = undefined;
  });

  it("returns 400 for invalid JSON body (no webhook secret)", async () => {
    const req = new Request("http://localhost/api/pay/webhook", {
      method: "POST",
      body: "not-json{{{",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("invalid_json");
  });

  it("records payment event for any event type", async () => {
    const event = makeStripeEvent("charge.succeeded");
    const res = await POST(makeWebhookRequest(event));
    expect(res.status).toBe(200);
    expect(mockAddPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "stripe",
        event: "charge.succeeded",
        verified: false,
      }),
      mockPrisma
    );
  });

  it("returns ok:true and verified:false without webhook secret", async () => {
    const event = makeStripeEvent("payment_intent.created");
    const res = await POST(makeWebhookRequest(event));
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.verified).toBe(false);
  });

  it("does not update order for non-succeeded events", async () => {
    const event = makeStripeEvent("payment_intent.created", { orderId: "ORD-1" });
    await POST(makeWebhookRequest(event));
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });

  it("updates order paymentStatus on payment_intent.succeeded", async () => {
    const event = makeStripeEvent("payment_intent.succeeded", { orderId: "ORD-1" });
    mockGetOrderById.mockResolvedValue({ id: "ORD-1" });
    mockUpdateOrder.mockResolvedValue({ id: "ORD-1", paymentStatus: "已支付" });
    const res = await POST(makeWebhookRequest(event));
    expect(res.status).toBe(200);
    expect(mockGetOrderById).toHaveBeenCalledWith("ORD-1");
    expect(mockUpdateOrder).toHaveBeenCalledWith("ORD-1", { paymentStatus: "已支付" }, mockPrisma);
  });
  it("does not update order if order not found", async () => {
    const event = makeStripeEvent("payment_intent.succeeded", { orderId: "ORD-MISSING" });
    mockGetOrderById.mockResolvedValue(null);
    await POST(makeWebhookRequest(event));
    expect(mockUpdateOrder).not.toHaveBeenCalled();
  });

  it("upserts ledger record on succeeded with metadata", async () => {
    const event = makeStripeEvent("payment_intent.succeeded", {
      orderId: "ORD-1",
      userAddress: "0xabc",
      diamondAmount: "100",
    });
    mockGetOrderById.mockResolvedValue({ id: "ORD-1" });
    mockUpdateOrder.mockResolvedValue({});
    mockUpsertLedgerRecord.mockResolvedValue(undefined);
    await POST(makeWebhookRequest(event));
    expect(mockUpsertLedgerRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ORD-1",
        userAddress: "0xabc",
        diamondAmount: 100,
        source: "stripe",
      }),
      mockPrisma
    );
  });

  it("ignores duplicate payment event insertion errors", async () => {
    mockAddPaymentEvent.mockRejectedValue(new Error("duplicate"));
    const event = makeStripeEvent("payment_intent.succeeded", { orderId: "ORD-1" });
    mockGetOrderById.mockResolvedValue({ id: "ORD-1" });
    mockUpdateOrder.mockResolvedValue({});
    const res = await POST(makeWebhookRequest(event));
    expect(res.status).toBe(200);
  });

  it("calls recordAudit with webhook authType", async () => {
    const event = makeStripeEvent("payment_intent.succeeded");
    await POST(makeWebhookRequest(event));
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.anything(),
      { role: "finance", authType: "webhook" },
      "payments.webhook",
      "payment",
      undefined,
      expect.objectContaining({ event: "payment_intent.succeeded" })
    );
  });

  it("extracts orderId from order_id metadata alias", async () => {
    const event = makeStripeEvent("payment_intent.succeeded", { order_id: "ORD-ALT" });
    mockGetOrderById.mockResolvedValue({ id: "ORD-ALT" });
    mockUpdateOrder.mockResolvedValue({});
    await POST(makeWebhookRequest(event));
    expect(mockGetOrderById).toHaveBeenCalledWith("ORD-ALT");
  });

  it("extracts payment_intent id from charge object via payment_intent field (string)", async () => {
    const event = {
      id: `evt_${Date.now()}`,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "ch_test123",
          object: "charge",
          amount: 9900,
          status: "succeeded",
          metadata: { orderId: "ORD-1", userAddress: "0xabc", diamondAmount: "100" },
          payment_intent: "pi_from_charge",
        },
      },
    };
    mockGetOrderById.mockResolvedValue({ id: "ORD-1" });
    mockUpdateOrder.mockResolvedValue({});
    mockUpsertLedgerRecord.mockResolvedValue(undefined);
    await POST(makeWebhookRequest(event));
    expect(mockUpsertLedgerRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptId: "stripe_pi_pi_from_charge",
      }),
      mockPrisma
    );
  });

  it("extracts payment_intent id from charge object via payment_intent object", async () => {
    const event = {
      id: `evt_${Date.now()}`,
      type: "payment_intent.succeeded",
      data: {
        object: {
          id: "ch_test456",
          object: "charge",
          amount: 5000,
          status: "succeeded",
          metadata: { orderId: "ORD-2", userAddress: "0xdef", diamondAmount: "50" },
          payment_intent: { id: "pi_nested" },
        },
      },
    };
    mockGetOrderById.mockResolvedValue({ id: "ORD-2" });
    mockUpdateOrder.mockResolvedValue({});
    mockUpsertLedgerRecord.mockResolvedValue(undefined);
    await POST(makeWebhookRequest(event));
    expect(mockUpsertLedgerRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptId: "stripe_pi_pi_nested",
      }),
      mockPrisma
    );
  });

  it("calls ledger credit API when all conditions met", async () => {
    mockEnv.LEDGER_ADMIN_TOKEN = "test-token";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const event = makeStripeEvent("payment_intent.succeeded", {
      orderId: "ORD-CREDIT",
      userAddress: "0xabc",
      diamondAmount: "100",
    });
    mockGetOrderById.mockResolvedValue({ id: "ORD-CREDIT" });
    mockUpdateOrder.mockResolvedValue({});
    mockUpsertLedgerRecord.mockResolvedValue(undefined);
    await POST(makeWebhookRequest(event));
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      })
    );
    fetchSpy.mockRestore();
    mockEnv.LEDGER_ADMIN_TOKEN = undefined;
  });

  it("handles ledger credit API failure gracefully", async () => {
    mockEnv.LEDGER_ADMIN_TOKEN = "test-token";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network error"));
    const event = makeStripeEvent("payment_intent.succeeded", {
      orderId: "ORD-CREDIT2",
      userAddress: "0xabc",
      diamondAmount: "100",
    });
    mockGetOrderById.mockResolvedValue({ id: "ORD-CREDIT2" });
    mockUpdateOrder.mockResolvedValue({});
    mockUpsertLedgerRecord.mockResolvedValue(undefined);
    const res = await POST(makeWebhookRequest(event));
    expect(res.status).toBe(200);
    fetchSpy.mockRestore();
    mockEnv.LEDGER_ADMIN_TOKEN = undefined;
  });

  it("does not upsert ledger record when diamondAmount is invalid", async () => {
    const event = makeStripeEvent("payment_intent.succeeded", {
      orderId: "ORD-1",
      userAddress: "0xabc",
      diamondAmount: "not-a-number",
    });
    mockGetOrderById.mockResolvedValue({ id: "ORD-1" });
    mockUpdateOrder.mockResolvedValue({});
    await POST(makeWebhookRequest(event));
    expect(mockUpsertLedgerRecord).not.toHaveBeenCalled();
  });

  it("does not upsert ledger record when diamondAmount is zero", async () => {
    const event = makeStripeEvent("payment_intent.succeeded", {
      orderId: "ORD-1",
      userAddress: "0xabc",
      diamondAmount: "0",
    });
    mockGetOrderById.mockResolvedValue({ id: "ORD-1" });
    mockUpdateOrder.mockResolvedValue({});
    await POST(makeWebhookRequest(event));
    expect(mockUpsertLedgerRecord).not.toHaveBeenCalled();
  });

  it("handles order update failure gracefully", async () => {
    const event = makeStripeEvent("payment_intent.succeeded", { orderId: "ORD-ERR" });
    mockGetOrderById.mockRejectedValue(new Error("db error"));
    const res = await POST(makeWebhookRequest(event));
    expect(res.status).toBe(200);
  });

  it("extracts user_address and diamond_amount aliases from metadata", async () => {
    const event = makeStripeEvent("payment_intent.succeeded", {
      orderId: "ORD-ALIAS",
      user_address: "0xalias",
      diamond_amount: "200",
    });
    mockGetOrderById.mockResolvedValue({ id: "ORD-ALIAS" });
    mockUpdateOrder.mockResolvedValue({});
    mockUpsertLedgerRecord.mockResolvedValue(undefined);
    await POST(makeWebhookRequest(event));
    expect(mockUpsertLedgerRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        userAddress: "0xalias",
        diamondAmount: 200,
      }),
      mockPrisma
    );
  });

  it("handles event with no data object", async () => {
    const event = { id: "evt_empty", type: "unknown", data: {} };
    const res = await POST(makeWebhookRequest(event));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });

  it("handles event with object missing metadata", async () => {
    const event = {
      id: "evt_nometa",
      type: "payment_intent.succeeded",
      data: {
        object: { id: "pi_nometa", object: "payment_intent", amount: 100, status: "succeeded" },
      },
    };
    mockGetOrderById.mockResolvedValue(null);
    const res = await POST(makeWebhookRequest(event));
    expect(res.status).toBe(200);
  });

  it("handles event with null amount and status", async () => {
    const event = {
      id: "evt_null",
      type: "charge.succeeded",
      data: { object: { id: "ch_null", object: "charge", metadata: {}, amount: null, status: "" } },
    };
    const res = await POST(makeWebhookRequest(event));
    expect(res.status).toBe(200);
  });

  it("handles ledger record upsert failure gracefully", async () => {
    const event = makeStripeEvent("payment_intent.succeeded", {
      orderId: "ORD-LEDGER-ERR",
      userAddress: "0xabc",
      diamondAmount: "100",
    });
    mockGetOrderById.mockResolvedValue({ id: "ORD-LEDGER-ERR" });
    mockUpdateOrder.mockResolvedValue({});
    mockUpsertLedgerRecord.mockRejectedValue(new Error("ledger error"));
    const res = await POST(makeWebhookRequest(event));
    expect(res.status).toBe(200);
  });

  it("handles empty event body gracefully", async () => {
    const event = {};
    const res = await POST(makeWebhookRequest(event));
    expect(res.status).toBe(200);
  });
});
