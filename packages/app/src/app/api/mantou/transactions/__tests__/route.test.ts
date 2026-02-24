import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  queryMantouTransactions: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
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
  queryMantouTransactions: mocks.queryMantouTransactions,
}));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));

import { GET } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

describe("GET /api/mantou/transactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
  });

  it("returns 400 for invalid address", async () => {
    mocks.normalizeSuiAddress.mockReturnValue("");
    mocks.isValidSuiAddress.mockReturnValue(false);
    const req = new Request("http://localhost/api/mantou/transactions?address=bad");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = new Request(`http://localhost/api/mantou/transactions?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns transactions", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    const result = { items: [{ id: "T-1" }], total: 1, page: 1, pageSize: 20 };
    mocks.queryMantouTransactions.mockResolvedValue(result);
    const req = new Request(`http://localhost/api/mantou/transactions?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(result);
  });

  it("respects page and pageSize params", async () => {
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.queryMantouTransactions.mockResolvedValue({ items: [], total: 0 });
    const req = new Request(
      `http://localhost/api/mantou/transactions?address=${VALID_ADDRESS}&page=2&pageSize=10`
    );
    await GET(req);
    expect(mocks.queryMantouTransactions).toHaveBeenCalledWith({
      address: VALID_ADDRESS,
      page: 2,
      pageSize: 10,
    });
  });
});
