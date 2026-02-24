import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
  parseBodyRaw: vi.fn(),
  creditLedgerWithAdmin: vi.fn(),
  env: {
    LEDGER_ADMIN_TOKEN: "test-token-123",
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

vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));
vi.mock("@/lib/shared/api-validation", () => ({
  parseBodyRaw: mocks.parseBodyRaw,
}));
vi.mock("@/lib/ledger/ledger-credit", () => ({
  creditLedgerWithAdmin: mocks.creditLedgerWithAdmin,
}));
vi.mock("@/lib/env", () => ({ env: mocks.env }));

import { POST } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

function makeReq(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("POST /api/ledger/credit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
  });

  it("returns 401 without auth token", async () => {
    const req = makeReq("http://localhost/api/ledger/credit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 401 with wrong token", async () => {
    const req = makeReq("http://localhost/api/ledger/credit", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-token" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("accepts Bearer token auth", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { user: VALID_ADDRESS, amount: "100", receiptId: "r1" },
    });
    mocks.creditLedgerWithAdmin.mockResolvedValue({ digest: "abc" });
    const req = makeReq("http://localhost/api/ledger/credit", {
      method: "POST",
      headers: { Authorization: "Bearer test-token-123" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("accepts x-admin-token auth", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { user: VALID_ADDRESS, amount: "100", receiptId: "r1" },
    });
    mocks.creditLedgerWithAdmin.mockResolvedValue({ digest: "abc" });
    const req = makeReq("http://localhost/api/ledger/credit", {
      method: "POST",
      headers: { "x-admin-token": "test-token-123" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("returns validation error for invalid body", async () => {
    const errResp = { status: 400, json: async () => ({ error: "Invalid" }) };
    mocks.parseBodyRaw.mockResolvedValue({ success: false, response: errResp });
    const req = makeReq("http://localhost/api/ledger/credit", {
      method: "POST",
      headers: { Authorization: "Bearer test-token-123" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid user address", async () => {
    mocks.isValidSuiAddress.mockReturnValue(false);
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { user: "bad", amount: "100", receiptId: "r1" },
    });
    const req = makeReq("http://localhost/api/ledger/credit", {
      method: "POST",
      headers: { Authorization: "Bearer test-token-123" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid user address");
  });

  it("returns 400 for zero amount", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { user: VALID_ADDRESS, amount: "0", receiptId: "r1" },
    });
    const req = makeReq("http://localhost/api/ledger/credit", {
      method: "POST",
      headers: { Authorization: "Bearer test-token-123" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("amount must be positive integer");
  });

  it("returns 500 when credit fails", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { user: VALID_ADDRESS, amount: "100", receiptId: "r1" },
    });
    mocks.creditLedgerWithAdmin.mockRejectedValue(new Error("tx failed"));
    const req = makeReq("http://localhost/api/ledger/credit", {
      method: "POST",
      headers: { Authorization: "Bearer test-token-123" },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("tx failed");
  });
});
