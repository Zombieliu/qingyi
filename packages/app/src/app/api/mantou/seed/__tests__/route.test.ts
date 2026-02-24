import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  creditMantou: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
  parseBody: vi.fn(),
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

vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/admin/admin-store", () => ({ creditMantou: mocks.creditMantou }));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));
vi.mock("@/lib/shared/api-validation", () => ({ parseBody: mocks.parseBody }));

import { POST } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

function makeReq(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("POST /api/mantou/seed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
  });

  it("returns auth error when admin auth fails", async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq("http://localhost/api/mantou/seed", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns validation error for invalid body", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, role: "finance" });
    const errResp = { status: 400, json: async () => ({ error: "Invalid" }) };
    mocks.parseBody.mockResolvedValue({ success: false, response: errResp });
    const req = makeReq("http://localhost/api/mantou/seed", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid address", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, role: "finance" });
    mocks.normalizeSuiAddress.mockReturnValue("");
    mocks.isValidSuiAddress.mockReturnValue(false);
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { address: "bad", amount: 100 },
    });
    const req = makeReq("http://localhost/api/mantou/seed", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("seeds mantou successfully", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, role: "finance" });
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, amount: 100 },
    });
    mocks.creditMantou.mockResolvedValue({ wallet: { balance: 100 } });
    const req = makeReq("http://localhost/api/mantou/seed", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.wallet.balance).toBe(100);
  });

  it("returns 500 when creditMantou fails", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, role: "finance" });
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { address: VALID_ADDRESS, amount: 100 },
    });
    mocks.creditMantou.mockRejectedValue(new Error("db error"));
    const req = makeReq("http://localhost/api/mantou/seed", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(500);
  });
});
