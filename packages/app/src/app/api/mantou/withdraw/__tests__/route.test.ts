import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  requestMantouWithdraw: vi.fn(),
  queryMantouWithdraws: vi.fn(),
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
vi.mock("@/lib/admin/admin-store", () => ({
  requestMantouWithdraw: mocks.requestMantouWithdraw,
  queryMantouWithdraws: mocks.queryMantouWithdraws,
}));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));
vi.mock("@/lib/shared/api-validation", () => ({ parseBodyRaw: mocks.parseBodyRaw }));

import { POST, GET } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

function makeReq(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("POST /api/mantou/withdraw", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
  });

  it("returns validation error for invalid body", async () => {
    const errResp = { status: 400, json: async () => ({ error: "Invalid" }) };
    mocks.parseBodyRaw.mockResolvedValue({ success: false, response: errResp });
    const req = makeReq("http://localhost/api/mantou/withdraw", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid address", async () => {
    mocks.normalizeSuiAddress.mockReturnValue("");
    mocks.isValidSuiAddress.mockReturnValue(false);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: "bad", amount: 100, account: "alipay123" },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/mantou/withdraw", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, amount: 100, account: "alipay123" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq("http://localhost/api/mantou/withdraw", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("creates withdraw request successfully", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, amount: 100, account: "alipay123" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.requestMantouWithdraw.mockResolvedValue({
      request: { id: "W-1" },
      wallet: { balance: 400 },
    });
    const req = makeReq("http://localhost/api/mantou/withdraw", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.wallet.balance).toBe(400);
  });

  it("returns 500 when withdraw fails", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, amount: 100, account: "alipay123" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.requestMantouWithdraw.mockRejectedValue(new Error("insufficient balance"));
    const req = makeReq("http://localhost/api/mantou/withdraw", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});

describe("GET /api/mantou/withdraw", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
  });

  it("returns 400 for invalid address", async () => {
    mocks.normalizeSuiAddress.mockReturnValue("");
    mocks.isValidSuiAddress.mockReturnValue(false);
    const req = makeReq("http://localhost/api/mantou/withdraw?address=bad");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq(`http://localhost/api/mantou/withdraw?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns withdraw records", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    const result = { items: [{ id: "W-1" }], total: 1, page: 1, pageSize: 20 };
    mocks.queryMantouWithdraws.mockResolvedValue(result);
    const req = makeReq(`http://localhost/api/mantou/withdraw?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(result);
  });
});
