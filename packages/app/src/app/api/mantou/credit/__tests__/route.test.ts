import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  creditMantou: vi.fn(),
  getOrderById: vi.fn(),
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
  creditMantou: mocks.creditMantou,
  getOrderById: mocks.getOrderById,
}));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));
vi.mock("@/lib/shared/api-validation", () => ({ parseBodyRaw: mocks.parseBodyRaw }));

import { POST } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

function makeReq(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("POST /api/mantou/credit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
  });

  it("returns validation error for invalid body", async () => {
    const errResp = { status: 400, json: async () => ({ error: "Invalid" }) };
    mocks.parseBodyRaw.mockResolvedValue({ success: false, response: errResp });
    const req = makeReq("http://localhost/api/mantou/credit", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid address", async () => {
    mocks.normalizeSuiAddress.mockReturnValue("");
    mocks.isValidSuiAddress.mockReturnValue(false);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: "bad", orderId: "ORD-1" },
      rawBody: "{}",
    });
    const req = makeReq("http://localhost/api/mantou/credit", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, orderId: "ORD-1" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq("http://localhost/api/mantou/credit", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 404 when order not found", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, orderId: "ORD-MISSING" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getOrderById.mockResolvedValue(null);
    const req = makeReq("http://localhost/api/mantou/credit", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("returns 403 when companion address does not match", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, orderId: "ORD-1" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getOrderById.mockResolvedValue({ id: "ORD-1", companionAddress: "0xother" });
    const req = makeReq("http://localhost/api/mantou/credit", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("returns 400 when no diamond charge", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, orderId: "ORD-1" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getOrderById.mockResolvedValue({
      id: "ORD-1",
      companionAddress: VALID_ADDRESS,
      meta: { diamondCharge: 0 },
    });
    const req = makeReq("http://localhost/api/mantou/credit", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("no diamond charge");
  });

  it("credits mantou successfully", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, orderId: "ORD-1" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getOrderById.mockResolvedValue({
      id: "ORD-1",
      companionAddress: VALID_ADDRESS,
      meta: { diamondCharge: 50 },
    });
    mocks.creditMantou.mockResolvedValue({ duplicated: false, wallet: { balance: 50 } });
    const req = makeReq("http://localhost/api/mantou/credit", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.wallet.balance).toBe(50);
  });

  it("returns 500 when creditMantou fails", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, orderId: "ORD-1" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getOrderById.mockResolvedValue({
      id: "ORD-1",
      companionAddress: VALID_ADDRESS,
      meta: { diamondCharge: 50 },
    });
    mocks.creditMantou.mockRejectedValue(new Error("db error"));
    const req = makeReq("http://localhost/api/mantou/credit", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });

  it("returns 403 when companionAddress is null", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, orderId: "ORD-1" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getOrderById.mockResolvedValue({ id: "ORD-1", companionAddress: null });
    const req = makeReq("http://localhost/api/mantou/credit", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it("handles non-finite diamondCharge", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, orderId: "ORD-1" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getOrderById.mockResolvedValue({
      id: "ORD-1",
      companionAddress: VALID_ADDRESS,
      meta: { diamondCharge: "not-a-number" },
    });
    const req = makeReq("http://localhost/api/mantou/credit", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("no diamond charge");
  });

  it("handles missing meta", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, orderId: "ORD-1" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.getOrderById.mockResolvedValue({
      id: "ORD-1",
      companionAddress: VALID_ADDRESS,
      meta: null,
    });
    const req = makeReq("http://localhost/api/mantou/credit", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
