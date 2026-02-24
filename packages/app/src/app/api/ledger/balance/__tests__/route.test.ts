import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  isValidSuiAddress: vi.fn(),
  normalizeSuiAddress: vi.fn(),
  devInspectTransactionBlock: vi.fn(),
  env: {
    SUI_RPC_URL: "https://rpc.test",
    SUI_PACKAGE_ID: "0xpkg",
    SUI_DAPP_HUB_ID: "0xhub",
    SUI_DAPP_HUB_INITIAL_SHARED_VERSION: "1",
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
vi.mock("@mysten/sui/client", () => ({
  SuiClient: class {
    devInspectTransactionBlock = mocks.devInspectTransactionBlock;
  },
}));
vi.mock("@mysten/sui/bcs", () => ({
  bcs: { u64: () => ({ parse: () => "100" }) },
}));
vi.mock("@mysten/sui/transactions", () => ({
  Transaction: class {
    moveCall() {}
    object() {}
    pure = { address: () => {} };
  },
  Inputs: { SharedObjectRef: () => ({}) },
}));
vi.mock("@/lib/env", () => ({ env: mocks.env }));

import { GET } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

function makeReq(url: string, headers?: Record<string, string>) {
  return new Request(url, { headers });
}

describe("GET /api/ledger/balance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeSuiAddress.mockImplementation((a: string) => a);
    mocks.isValidSuiAddress.mockReturnValue(true);
    mocks.devInspectTransactionBlock.mockResolvedValue({
      results: [{ returnValues: [[[1, 0, 0, 0, 0, 0, 0, 0], "u64"]] }],
    });
  });

  it("returns 400 for missing address", async () => {
    mocks.normalizeSuiAddress.mockReturnValue("");
    mocks.isValidSuiAddress.mockReturnValue(false);
    const req = makeReq("http://localhost/api/ledger/balance");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid address", async () => {
    mocks.isValidSuiAddress.mockReturnValue(false);
    const req = makeReq("http://localhost/api/ledger/balance?address=bad");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("skips balance query for admin referer", async () => {
    const req = makeReq(`http://localhost/api/ledger/balance?address=${VALID_ADDRESS}`, {
      referer: "http://localhost/admin/dashboard",
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.skipped).toBe(true);
    expect(body.balance).toBe("0");
  });

  it("returns balance for valid address", async () => {
    const req = makeReq(`http://localhost/api/ledger/balance?address=${VALID_ADDRESS}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.balance).toBeDefined();
  });

  it("returns 500 on RPC error with no cache", async () => {
    const freshAddr = "0x" + "f".repeat(64);
    mocks.devInspectTransactionBlock.mockRejectedValue(new Error("RPC down"));
    const req = makeReq(`http://localhost/api/ledger/balance?address=${freshAddr}`);
    const res = await GET(req);
    expect(res.status).toBe(500);
  });

  it("returns cached balance on second request within TTL", async () => {
    const addr = "0x" + "c".repeat(64);
    mocks.devInspectTransactionBlock.mockResolvedValue({
      results: [{ returnValues: [[[1, 0, 0, 0, 0, 0, 0, 0], "u64"]] }],
    });
    // First request populates cache
    const req1 = makeReq(`http://localhost/api/ledger/balance?address=${addr}`);
    const res1 = await GET(req1);
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.ok).toBe(true);

    // Second request should hit cache
    const req2 = makeReq(`http://localhost/api/ledger/balance?address=${addr}`);
    const res2 = await GET(req2);
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.cached).toBe(true);
  });

  it("returns fallback cached value on RPC error when cache exists", async () => {
    const addr = "0x" + "d".repeat(64);
    // First request succeeds and populates cache
    mocks.devInspectTransactionBlock.mockResolvedValueOnce({
      results: [{ returnValues: [[[1, 0, 0, 0, 0, 0, 0, 0], "u64"]] }],
    });
    const req1 = makeReq(`http://localhost/api/ledger/balance?address=${addr}`);
    await GET(req1);

    // Expire the cache by advancing Date.now
    const origDateNow = Date.now;
    Date.now = () => origDateNow() + 20_000;

    mocks.devInspectTransactionBlock.mockRejectedValueOnce(new Error("RPC down"));
    const req2 = makeReq(`http://localhost/api/ledger/balance?address=${addr}`);
    const res2 = await GET(req2);
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.fallback).toBe(true);

    Date.now = origDateNow;
  });

  it("handles invalid referer gracefully", async () => {
    const req = makeReq(`http://localhost/api/ledger/balance?address=${VALID_ADDRESS}`, {
      referer: "not-a-valid-url",
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("returns 500 with error message on exception", async () => {
    const addr = "0x" + "b".repeat(64);
    mocks.devInspectTransactionBlock.mockRejectedValue(new Error("custom error"));
    const req = makeReq(`http://localhost/api/ledger/balance?address=${addr}`);
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("custom error");
  });

  it("returns 500 when env vars are missing", async () => {
    const addr = "0x" + "1".repeat(64);
    const origRpc = mocks.env.SUI_RPC_URL;
    mocks.env.SUI_RPC_URL = "";
    const req = makeReq(`http://localhost/api/ledger/balance?address=${addr}`);
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Missing env");
    mocks.env.SUI_RPC_URL = origRpc;
  });

  it("returns 500 when multiple env vars are missing", async () => {
    const addr = "0x" + "2".repeat(64);
    const origPkg = mocks.env.SUI_PACKAGE_ID;
    const origHub = mocks.env.SUI_DAPP_HUB_ID;
    mocks.env.SUI_PACKAGE_ID = "";
    mocks.env.SUI_DAPP_HUB_ID = "";
    const req = makeReq(`http://localhost/api/ledger/balance?address=${addr}`);
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain("SUI_PACKAGE_ID");
    expect(body.error).toContain("SUI_DAPP_HUB_ID");
    mocks.env.SUI_PACKAGE_ID = origPkg;
    mocks.env.SUI_DAPP_HUB_ID = origHub;
  });

  it("handles devInspect returning string value", async () => {
    const addr = "0x" + "3".repeat(64);
    mocks.devInspectTransactionBlock.mockResolvedValue({
      results: [{ returnValues: [["AQAAAAAAAAAA", "u64"]] }],
    });
    const req = makeReq(`http://localhost/api/ledger/balance?address=${addr}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("handles devInspect returning no return values", async () => {
    const addr = "0x" + "4".repeat(64);
    mocks.devInspectTransactionBlock.mockResolvedValue({
      results: [{ returnValues: [] }],
    });
    const req = makeReq(`http://localhost/api/ledger/balance?address=${addr}`);
    const res = await GET(req);
    expect(res.status).toBe(200);
  });

  it("handles non-admin referer path normally", async () => {
    const req = makeReq(`http://localhost/api/ledger/balance?address=${VALID_ADDRESS}`, {
      referer: "http://localhost/dashboard",
    });
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
