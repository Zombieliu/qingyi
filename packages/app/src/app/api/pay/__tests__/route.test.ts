import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
  parseBodyRaw: vi.fn(),
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

import { POST } from "../precreate/route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

function makeReq(url: string, init?: RequestInit) {
  return new Request(url, init);
}

const validPayload = {
  platform: "wechat" as const,
  orderId: "ORD-001",
  amount: 100,
  userAddress: VALID_ADDRESS,
  subject: "diamond.topup",
  body: "diamond.topup_title",
};

describe("POST /api/pay/precreate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
  });

  it("returns validation error for invalid body", async () => {
    const errResp = { status: 400, json: async () => ({ error: "Invalid" }) };
    mocks.parseBodyRaw.mockResolvedValue({ success: false, response: errResp });
    const req = makeReq("http://localhost/api/pay/precreate", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid userAddress", async () => {
    mocks.isValidSuiAddress.mockReturnValue(false);
    mocks.normalizeSuiAddress.mockReturnValue("");
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { ...validPayload, userAddress: "bad" },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/pay/precreate", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_userAddress");
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
    const req = makeReq("http://localhost/api/pay/precreate", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("creates wechat payment successfully", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: validPayload,
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    const req = makeReq("http://localhost/api/pay/precreate", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.platform).toBe("wechat");
    expect(body.orderId).toBe("ORD-001");
    expect(body.paymentId).toBeDefined();
    expect(body.paymentParams.timeStamp).toBeDefined();
    expect(body.paymentParams.nonceStr).toBeDefined();
    expect(body.paymentParams.paySign).toBeDefined();
    expect(body.mock).toBe(true);
  });

  it("creates alipay payment successfully", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { ...validPayload, platform: "alipay" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    const req = makeReq("http://localhost/api/pay/precreate", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.platform).toBe("alipay");
    expect(body.paymentParams.tradeNo).toBeDefined();
    expect(body.paymentParams.orderStr).toBeDefined();
  });

  it("creates douyin payment successfully", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { ...validPayload, platform: "douyin" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    const req = makeReq("http://localhost/api/pay/precreate", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.platform).toBe("douyin");
    expect(body.paymentParams.orderInfo).toBeDefined();
    expect(body.paymentParams.service).toBe("bytepay");
  });

  it("returns correct amount in response", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { ...validPayload, amount: 250 },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    const req = makeReq("http://localhost/api/pay/precreate", { method: "POST" });
    const res = await POST(req);
    const body = await res.json();
    expect(body.amount).toBe(250);
  });

  it("includes expiresAt in response", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: validPayload,
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    const before = Date.now();
    const req = makeReq("http://localhost/api/pay/precreate", { method: "POST" });
    const res = await POST(req);
    const body = await res.json();
    expect(body.expiresAt).toBeGreaterThan(before);
  });

  it("generates unique paymentIds", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: validPayload,
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    const req1 = makeReq("http://localhost/api/pay/precreate", { method: "POST" });
    const res1 = await POST(req1);
    const body1 = await res1.json();
    const req2 = makeReq("http://localhost/api/pay/precreate", { method: "POST" });
    const res2 = await POST(req2);
    const body2 = await res2.json();
    expect(body1.paymentId).not.toBe(body2.paymentId);
  });

  it("calls requireUserAuth with correct intent", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: validPayload,
      rawBody: '{"test":1}',
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    const req = makeReq("http://localhost/api/pay/precreate", { method: "POST" });
    await POST(req);
    expect(mocks.requireUserAuth).toHaveBeenCalledWith(req, {
      intent: "pay:precreate:ORD-001",
      address: VALID_ADDRESS,
      body: '{"test":1}',
    });
  });
});
