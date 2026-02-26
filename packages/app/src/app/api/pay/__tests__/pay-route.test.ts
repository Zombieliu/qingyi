import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
  parseBodyRaw: vi.fn(),
  upsertLedgerRecord: vi.fn(),
  stripeCreate: vi.fn(),
  stripeRetrieve: vi.fn(),
  env: { STRIPE_SECRET_KEY: "sk_test_xxx" },
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
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));
vi.mock("@/lib/shared/api-validation", () => ({
  parseBodyRaw: mocks.parseBodyRaw,
}));
vi.mock("@/lib/admin/admin-store", () => ({
  upsertLedgerRecord: mocks.upsertLedgerRecord,
}));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("stripe", () => {
  return {
    default: class Stripe {
      paymentIntents = {
        create: mocks.stripeCreate,
        retrieve: mocks.stripeRetrieve,
      };
    },
  };
});

import { POST } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

function makeReq(url: string, init?: RequestInit) {
  return new Request(url, init);
}

const validPayload = {
  amount: 100,
  subject: "diamond.topup",
  body: "diamond.topup_title",
  channel: "wechat_pay" as const,
  orderId: "ORD-001",
  userAddress: VALID_ADDRESS,
  diamondAmount: 50,
};

const stripeIntent = {
  id: "pi_test_123",
  client_secret: "pi_test_123_secret",
  status: "requires_action",
  next_action: {
    type: "wechat_pay_display_qr_code",
    wechat_pay_display_qr_code: {
      image_url_png: "https://example.com/qr.png",
      data: "weixin://pay/xxx",
    },
  },
};

describe("POST /api/pay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
    mocks.env.STRIPE_SECRET_KEY = "sk_test_xxx";
  });

  it("returns validation error for invalid body", async () => {
    const errResp = { status: 400, json: async () => ({ error: "Invalid" }) };
    mocks.parseBodyRaw.mockResolvedValue({ success: false, response: errResp });
    const req = makeReq("http://localhost/api/pay", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 503 when stripe is unavailable", async () => {
    mocks.env.STRIPE_SECRET_KEY = "";
    vi.resetModules();
    // Re-mock with empty key
    const mod = await import("../route");
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: validPayload,
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/pay", { method: "POST" });
    const res = await mod.POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("stripe_unavailable");
  });

  it("returns 400 for invalid userAddress", async () => {
    mocks.isValidSuiAddress.mockReturnValue(false);
    mocks.normalizeSuiAddress.mockReturnValue("bad");
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { ...validPayload, userAddress: "bad" },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/pay", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid userAddress");
  });

  it("returns auth error when user auth fails", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: validPayload,
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq("http://localhost/api/pay", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when alipay has no returnUrl and no origin", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { ...validPayload, channel: "alipay" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    const req = makeReq("http://localhost/api/pay", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("returnUrl required for alipay");
  });

  it("creates wechat payment successfully", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: validPayload,
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.stripeCreate.mockResolvedValue(stripeIntent);
    mocks.upsertLedgerRecord.mockResolvedValue(undefined);
    const req = makeReq("http://localhost:3000/api/pay", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paymentIntentId).toBe("pi_test_123");
    expect(body.clientSecret).toBe("pi_test_123_secret");
    expect(body.qrCodeUrl).toBe("https://example.com/qr.png");
    expect(body.qrCodeText).toBe("weixin://pay/xxx");
  });

  it("creates alipay payment with returnUrl", async () => {
    const alipayIntent = {
      id: "pi_alipay_123",
      client_secret: "pi_alipay_secret",
      status: "requires_action",
      next_action: {
        type: "redirect_to_url",
        redirect_to_url: { url: "https://alipay.com/pay" },
      },
    };
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { ...validPayload, channel: "alipay", returnUrl: "http://localhost/wallet" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.stripeCreate.mockResolvedValue(alipayIntent);
    const req = makeReq("http://localhost/api/pay", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.redirectUrl).toBe("https://alipay.com/pay");
  });

  it("returns 500 when stripe throws", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: validPayload,
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.stripeCreate.mockRejectedValue(new Error("Stripe error"));
    const req = makeReq("http://localhost:3000/api/pay", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Stripe error");
  });

  it("records ledger entry on success", async () => {
    const successIntent = { ...stripeIntent, status: "succeeded", next_action: undefined };
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: validPayload,
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.stripeCreate.mockResolvedValue(successIntent);
    const req = makeReq("http://localhost:3000/api/pay", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    await POST(req);
    expect(mocks.upsertLedgerRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "ORD-001",
        userAddress: VALID_ADDRESS,
        status: "paid",
        source: "stripe",
      })
    );
  });

  it("does not fail when ledger record throws", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: validPayload,
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.stripeCreate.mockResolvedValue(stripeIntent);
    mocks.upsertLedgerRecord.mockRejectedValue(new Error("db error"));
    const req = makeReq("http://localhost:3000/api/pay", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("retrieves intent when wechat qr data is missing", async () => {
    const emptyQrIntent = {
      id: "pi_test_456",
      client_secret: "pi_test_456_secret",
      status: "requires_action",
      next_action: {
        type: "wechat_pay_display_qr_code",
        wechat_pay_display_qr_code: {},
      },
    };
    const refreshedIntent = {
      ...emptyQrIntent,
      next_action: {
        type: "wechat_pay_display_qr_code",
        wechat_pay_display_qr_code: { image_url_png: "https://example.com/qr2.png" },
      },
    };
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: validPayload,
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.stripeCreate.mockResolvedValue(emptyQrIntent);
    mocks.stripeRetrieve.mockResolvedValue(refreshedIntent);
    const req = makeReq("http://localhost:3000/api/pay", {
      method: "POST",
      headers: { origin: "http://localhost:3000" },
    });
    await POST(req);
    expect(mocks.stripeRetrieve).toHaveBeenCalledWith("pi_test_456");
  });

  it("uses origin as fallback returnUrl for wechat", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: validPayload,
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.stripeCreate.mockResolvedValue(stripeIntent);
    const req = makeReq("http://mysite.com/api/pay", {
      method: "POST",
      headers: { origin: "http://mysite.com" },
    });
    await POST(req);
    expect(mocks.stripeCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        return_url: "http://mysite.com/wallet",
      }),
      expect.anything()
    );
  });
});
