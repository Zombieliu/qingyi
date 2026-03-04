import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  addSupportTicketEdgeWrite: vi.fn(),
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

vi.mock("@/lib/edge-db/support-write-store", () => ({
  addSupportTicketEdgeWrite: mocks.addSupportTicketEdgeWrite,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/shared/api-utils", () => ({ getClientIp: mocks.getClientIp }));
vi.mock("@/lib/shared/api-validation", () => ({ parseBody: mocks.parseBody }));

import { POST } from "../route";

function createMockRequest(url: string, options?: RequestInit) {
  return new Request(url, options);
}

describe("POST /api/support", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(true);
    mocks.getClientIp.mockReturnValue("127.0.0.1");
    mocks.addSupportTicketEdgeWrite.mockResolvedValue(undefined);
  });

  it("returns 429 when rate limited", async () => {
    mocks.rateLimit.mockResolvedValue(false);
    const req = createMockRequest("http://localhost/api/support", {
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
      response: { status: 400, json: async () => ({ error: "message required" }) },
    });
    const req = createMockRequest("http://localhost/api/support", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates support ticket successfully", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        message: "I need help",
        name: "User1",
        contact: "user@test.com",
        topic: "订单问题",
      },
    });
    const req = createMockRequest("http://localhost/api/support", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toMatch(/^SUP-/);
    expect(body.status).toBe("待处理");
    expect(mocks.addSupportTicketEdgeWrite).toHaveBeenCalled();
  });

  it("uses default topic when not provided", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { message: "Help me" },
    });
    const req = createMockRequest("http://localhost/api/support", {
      method: "POST",
      body: "{}",
    });
    await POST(req);
    const call = mocks.addSupportTicketEdgeWrite.mock.calls[0][0];
    expect(call.topic).toBe("其他");
  });

  it("includes screenshots in meta when provided", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        message: "Bug report",
        screenshots: ["data:image/png;base64,abc", "data:image/png;base64,def"],
      },
    });
    const req = createMockRequest("http://localhost/api/support", {
      method: "POST",
      body: "{}",
    });
    await POST(req);
    const call = mocks.addSupportTicketEdgeWrite.mock.calls[0][0];
    expect(call.meta).toEqual({
      screenshots: ["data:image/png;base64,abc", "data:image/png;base64,def"],
    });
  });

  it("does not include meta when no screenshots", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { message: "Simple question" },
    });
    const req = createMockRequest("http://localhost/api/support", {
      method: "POST",
      body: "{}",
    });
    await POST(req);
    const call = mocks.addSupportTicketEdgeWrite.mock.calls[0][0];
    expect(call.meta).toEqual({});
  });

  it("merges body.meta with screenshots", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        message: "Dispute",
        screenshots: ["data:image/png;base64,abc"],
        meta: { type: "chain_dispute", orderId: "ORD-1" },
      },
    });
    const req = createMockRequest("http://localhost/api/support", {
      method: "POST",
      body: "{}",
    });
    await POST(req);
    const call = mocks.addSupportTicketEdgeWrite.mock.calls[0][0];
    expect(call.meta).toEqual({
      type: "chain_dispute",
      orderId: "ORD-1",
      screenshots: ["data:image/png;base64,abc"],
    });
  });

  it("passes body.meta without screenshots", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        message: "Dispute",
        meta: { type: "chain_dispute", orderId: "ORD-2" },
      },
    });
    const req = createMockRequest("http://localhost/api/support", {
      method: "POST",
      body: "{}",
    });
    await POST(req);
    const call = mocks.addSupportTicketEdgeWrite.mock.calls[0][0];
    expect(call.meta).toEqual({ type: "chain_dispute", orderId: "ORD-2" });
  });

  it("uses rate limit with correct key pattern", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { message: "test" },
    });
    const req = createMockRequest("http://localhost/api/support", {
      method: "POST",
      body: "{}",
    });
    await POST(req);
    expect(mocks.rateLimit).toHaveBeenCalledWith("support:127.0.0.1", 5, 60000);
  });

  it("maps userName from name field", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { message: "test", name: "Alice", userName: "Bob" },
    });
    const req = createMockRequest("http://localhost/api/support", {
      method: "POST",
      body: "{}",
    });
    await POST(req);
    const call = mocks.addSupportTicketEdgeWrite.mock.calls[0][0];
    // name takes priority over userName
    expect(call.userName).toBe("Alice");
  });

  it("generates unique ticket IDs", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { message: "test" },
    });
    const req1 = createMockRequest("http://localhost/api/support", { method: "POST", body: "{}" });
    const req2 = createMockRequest("http://localhost/api/support", { method: "POST", body: "{}" });
    const res1 = await POST(req1);
    const res2 = await POST(req2);
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1.id).not.toBe(body2.id);
  });
});
