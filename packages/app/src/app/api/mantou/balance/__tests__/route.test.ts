import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  getMantouWallet: vi.fn(),
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
}));

vi.mock("next/server", () => {
  class MockNextResponse {
    body: unknown;
    status: number;
    headers: Map<string, string>;
    constructor(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      this.body = body;
      this.status = init?.status ?? 200;
      this.headers = new Map(Object.entries(init?.headers || {}));
    }
    async json() {
      return this.body;
    }
    static json(data: unknown, init?: { status?: number; headers?: Record<string, string> }) {
      return new MockNextResponse(data, init);
    }
  }
  return { NextResponse: MockNextResponse };
});

vi.mock("@/lib/auth/user-auth", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("@/lib/admin/admin-store", () => ({ getMantouWallet: mocks.getMantouWallet }));
vi.mock("@mysten/sui/utils", () => ({
  isValidSuiAddress: mocks.isValidSuiAddress,
  normalizeSuiAddress: mocks.normalizeSuiAddress,
}));

import { GET } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

function makeReq(url: string, headers?: Record<string, string>) {
  return new Request(url, { headers });
}

describe("GET /api/mantou/balance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
  });
  it("returns 400 for invalid address", async () => {
    mocks.normalizeSuiAddress.mockReturnValue("");
    mocks.isValidSuiAddress.mockReturnValue(false);
    const req = makeReq(`http://localhost/api/mantou/balance?address=bad`);
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid address");
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq(`http://localhost/api/mantou/balance?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns balance from wallet", async () => {
    mocks.getMantouWallet.mockResolvedValue({ balance: 500, frozen: 100 });
    const req = makeReq(`http://localhost/api/mantou/balance?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.balance).toBe(500);
    expect(body.frozen).toBe(100);
  });

  it("skips for admin referer", async () => {
    const req = makeReq(`http://localhost/api/mantou/balance?address=${VALID_ADDRESS}`, {
      referer: "http://localhost/admin/dashboard",
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
  });

  it("ignores invalid referer URL", async () => {
    const addr = "0x" + "b".repeat(64);
    mocks.normalizeSuiAddress.mockReturnValue(addr);
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: addr });
    mocks.getMantouWallet.mockResolvedValue({ balance: 100, frozen: 0 });
    const req = makeReq(`http://localhost/api/mantou/balance?address=${addr}`, {
      referer: "not-a-valid-url",
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.balance).toBe(100);
  });

  it("returns cached balance when within TTL", async () => {
    // Use a unique address for this test to avoid cache pollution
    const addr = "0x" + "c".repeat(64);
    mocks.normalizeSuiAddress.mockReturnValue(addr);
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: addr });
    mocks.getMantouWallet.mockResolvedValue({ balance: 500, frozen: 100 });

    // First call to populate cache
    const req1 = makeReq(`http://localhost/api/mantou/balance?address=${addr}`);
    await GET(req1);

    // Second call should return cached
    mocks.getMantouWallet.mockClear();
    const req2 = makeReq(`http://localhost/api/mantou/balance?address=${addr}`);
    const res = await GET(req2);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(true);
    expect(body.balance).toBe(500);
    expect(body.frozen).toBe(100);
  });

  it("returns fallback cached value when getMantouWallet fails after cache expires", async () => {
    // Use a unique address
    const addr = "0x" + "e".repeat(64);
    mocks.normalizeSuiAddress.mockReturnValue(addr);
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: addr });

    // Populate cache with a successful call
    mocks.getMantouWallet.mockResolvedValue({ balance: 300, frozen: 50 });
    const req1 = makeReq(`http://localhost/api/mantou/balance?address=${addr}`);
    await GET(req1);

    // Now advance time past TTL using fake timers
    const originalDateNow = Date.now;
    const baseTime = Date.now();
    Date.now = () => baseTime + 11000; // 11 seconds later, past 10s TTL

    // Now fail the wallet call
    mocks.getMantouWallet.mockRejectedValue(new Error("db error"));
    const req2 = makeReq(`http://localhost/api/mantou/balance?address=${addr}`);
    const res = await GET(req2);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.fallback).toBe(true);
    expect(body.balance).toBe(300);
    expect(body.frozen).toBe(50);

    Date.now = originalDateNow;
  });

  it("throws error when getMantouWallet fails with no cached value", async () => {
    // Use a fresh address that has no cache
    const freshAddr = "0x" + "f".repeat(64);
    mocks.normalizeSuiAddress.mockReturnValue(freshAddr);
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: freshAddr });
    mocks.getMantouWallet.mockRejectedValue(new Error("db error"));
    const req = makeReq(`http://localhost/api/mantou/balance?address=${freshAddr}`);
    await expect(GET(req)).rejects.toThrow("db error");
  });

  it("deduplicates inflight requests", async () => {
    // Use a unique address to avoid cache from previous tests
    const uniqueAddr = "0x" + "d".repeat(64);
    mocks.normalizeSuiAddress.mockReturnValue(uniqueAddr);
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: uniqueAddr });

    let resolveWallet: (v: { balance: number; frozen: number }) => void;
    const walletPromise = new Promise<{ balance: number; frozen: number }>((r) => {
      resolveWallet = r;
    });
    mocks.getMantouWallet.mockReturnValue(walletPromise);

    // Start first request (will be inflight)
    const req1 = makeReq(`http://localhost/api/mantou/balance?address=${uniqueAddr}`);
    const p1 = GET(req1);

    // Start second request while first is inflight
    const req2 = makeReq(`http://localhost/api/mantou/balance?address=${uniqueAddr}`);
    const p2 = GET(req2);

    // Resolve the wallet call
    resolveWallet!({ balance: 999, frozen: 0 });

    const [res1, res2] = await Promise.all([p1, p2]);
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1.balance).toBe(999);
    expect(body2.balance).toBe(999);
    // getMantouWallet should only be called once
    expect(mocks.getMantouWallet).toHaveBeenCalledTimes(1);
  });
});
