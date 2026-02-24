import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  addInvoiceRequest: vi.fn(),
  rateLimit: vi.fn(),
  getClientIp: vi.fn(),
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

vi.mock("@/lib/admin/admin-store", () => ({
  addInvoiceRequest: mocks.addInvoiceRequest,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/shared/api-utils", () => ({ getClientIp: mocks.getClientIp }));
vi.mock("@/lib/shared/api-validation", () => ({ parseBody: mocks.parseBody }));

import { POST } from "../route";

function createMockRequest(url: string, options?: RequestInit) {
  return new Request(url, options);
}

describe("POST /api/invoices", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(true);
    mocks.getClientIp.mockReturnValue("127.0.0.1");
    mocks.addInvoiceRequest.mockResolvedValue(undefined);
  });

  it("returns 429 when rate limited", async () => {
    mocks.rateLimit.mockResolvedValue(false);
    const req = createMockRequest("http://localhost/api/invoices", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
  });

  it("returns error for invalid body", async () => {
    mocks.parseBody.mockResolvedValue({
      success: false,
      response: { status: 400, json: async () => ({ error: "title required" }) },
    });
    const req = createMockRequest("http://localhost/api/invoices", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates invoice request successfully", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        title: "Test Company",
        email: "test@example.com",
        taxId: "123456",
        orderId: "ORD-1",
        amount: 100,
      },
    });
    const req = createMockRequest("http://localhost/api/invoices", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toMatch(/^INV-/);
    expect(body.status).toBe("待审核");
    expect(mocks.addInvoiceRequest).toHaveBeenCalled();
  });

  it("creates invoice with minimal fields", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { title: "Company", email: "a@b.com" },
    });
    const req = createMockRequest("http://localhost/api/invoices", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBeDefined();
  });

  it("passes all fields to addInvoiceRequest", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        title: "Corp",
        email: "e@e.com",
        taxId: "TAX",
        contact: "John",
        orderId: "ORD-2",
        amount: 200,
        address: "123 St",
        note: "urgent",
        userAddress: "0xabc",
      },
    });
    const req = createMockRequest("http://localhost/api/invoices", {
      method: "POST",
      body: "{}",
    });
    await POST(req);
    const call = mocks.addInvoiceRequest.mock.calls[0][0];
    expect(call.title).toBe("Corp");
    expect(call.email).toBe("e@e.com");
    expect(call.taxId).toBe("TAX");
    expect(call.contact).toBe("John");
    expect(call.orderId).toBe("ORD-2");
    expect(call.amount).toBe(200);
    expect(call.note).toBe("urgent");
    expect(call.userAddress).toBe("0xabc");
  });

  it("generates unique invoice IDs", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { title: "A", email: "a@a.com" },
    });
    const req1 = createMockRequest("http://localhost/api/invoices", { method: "POST", body: "{}" });
    const req2 = createMockRequest("http://localhost/api/invoices", { method: "POST", body: "{}" });
    const res1 = await POST(req1);
    const res2 = await POST(req2);
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1.id).not.toBe(body2.id);
  });

  it("uses rate limit with correct key pattern", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { title: "A", email: "a@a.com" },
    });
    const req = createMockRequest("http://localhost/api/invoices", { method: "POST", body: "{}" });
    await POST(req);
    expect(mocks.rateLimit).toHaveBeenCalledWith("invoices:127.0.0.1", 5, 60000);
  });

  it("sets status to 待审核", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { title: "A", email: "a@a.com" },
    });
    const req = createMockRequest("http://localhost/api/invoices", { method: "POST", body: "{}" });
    await POST(req);
    const call = mocks.addInvoiceRequest.mock.calls[0][0];
    expect(call.status).toBe("待审核");
  });
});
