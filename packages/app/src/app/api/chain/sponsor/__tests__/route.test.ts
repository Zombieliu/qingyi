import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  buildSponsoredTransactionFromKind: vi.fn(),
  executeSponsoredTransaction: vi.fn(),
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

vi.mock("@/lib/chain/chain-sponsor", () => ({
  buildSponsoredTransactionFromKind: mocks.buildSponsoredTransactionFromKind,
  executeSponsoredTransaction: mocks.executeSponsoredTransaction,
}));
vi.mock("@/lib/shared/api-validation", () => ({ parseBody: mocks.parseBody }));

import { POST } from "../route";

describe("POST /api/chain/sponsor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns validation error for invalid body", async () => {
    const errResp = { status: 400, json: async () => ({ error: "Invalid" }) };
    mocks.parseBody.mockResolvedValue({ success: false, response: errResp });
    const req = new Request("http://localhost/api/chain/sponsor", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when prepare step missing sender", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { step: "prepare" },
    });
    const req = new Request("http://localhost/api/chain/sponsor", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("sender and kindBytes are required");
  });

  it("prepares sponsored transaction successfully", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { step: "prepare", sender: "0xabc", kindBytes: "0x123" },
    });
    const result = { txBytes: "0xtx", sponsorSignature: "0xsig" };
    mocks.buildSponsoredTransactionFromKind.mockResolvedValue(result);
    const req = new Request("http://localhost/api/chain/sponsor", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.txBytes).toBe("0xtx");
  });

  it("returns 400 when prepare fails", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { step: "prepare", sender: "0xabc", kindBytes: "0x123" },
    });
    mocks.buildSponsoredTransactionFromKind.mockRejectedValue(new Error("gas error"));
    const req = new Request("http://localhost/api/chain/sponsor", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("gas error");
  });

  it("returns 400 when execute step missing txBytes", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { step: "execute" },
    });
    const req = new Request("http://localhost/api/chain/sponsor", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("txBytes and userSignature are required");
  });

  it("executes sponsored transaction successfully", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { step: "execute", txBytes: "0xtx", userSignature: "0xsig" },
    });
    const result = { digest: "0xdigest" };
    mocks.executeSponsoredTransaction.mockResolvedValue(result);
    const req = new Request("http://localhost/api/chain/sponsor", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.digest).toBe("0xdigest");
  });

  it("returns 400 when execute fails", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { step: "execute", txBytes: "0xtx", userSignature: "0xsig" },
    });
    mocks.executeSponsoredTransaction.mockRejectedValue(new Error("tx failed"));
    const req = new Request("http://localhost/api/chain/sponsor", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
