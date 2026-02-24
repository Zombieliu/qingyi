import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  createDispute: vi.fn(),
  getDispute: vi.fn(),
  listUserDisputes: vi.fn(),
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

vi.mock("@/lib/auth/user-auth", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("@/lib/services/dispute-service", () => ({
  createDispute: mocks.createDispute,
  getDispute: mocks.getDispute,
  listUserDisputes: mocks.listUserDisputes,
}));
vi.mock("@/lib/shared/api-validation", () => ({ parseBody: mocks.parseBody }));

import { POST, GET } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

function createMockRequest(url: string, options?: RequestInit) {
  return new Request(url, {
    ...options,
    headers: {
      "x-auth-address": VALID_ADDRESS,
      ...options?.headers,
    },
  });
}

describe("POST /api/disputes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = createMockRequest("http://localhost/api/disputes", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns error for invalid body", async () => {
    mocks.parseBody.mockResolvedValue({
      success: false,
      response: { status: 400, json: async () => ({ error: "validation error" }) },
    });
    const req = createMockRequest("http://localhost/api/disputes", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("creates dispute successfully", async () => {
    const dispute = {
      id: "DSP-1",
      orderId: "ORD-1",
      reason: "service_quality",
      description: "Bad service quality experienced",
      status: "open",
    };
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        orderId: "ORD-1",
        reason: "service_quality",
        description: "Bad service quality experienced",
      },
    });
    mocks.createDispute.mockResolvedValue(dispute);
    const req = createMockRequest("http://localhost/api/disputes", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBe("DSP-1");
  });

  it("returns 400 when createDispute throws", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        orderId: "ORD-1",
        reason: "no_show",
        description: "Player did not show up for the session",
      },
    });
    mocks.createDispute.mockRejectedValue(new Error("duplicate dispute"));
    const req = createMockRequest("http://localhost/api/disputes", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("duplicate dispute");
  });

  it("passes userAddress from auth to createDispute", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        orderId: "ORD-1",
        reason: "overcharge",
        description: "I was charged more than the agreed amount",
      },
    });
    mocks.createDispute.mockResolvedValue({ id: "DSP-2" });
    const req = createMockRequest("http://localhost/api/disputes", {
      method: "POST",
      body: "{}",
    });
    await POST(req);
    expect(mocks.createDispute).toHaveBeenCalledWith(
      expect.objectContaining({ userAddress: VALID_ADDRESS })
    );
  });

  it("handles non-Error thrown from createDispute", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        orderId: "ORD-1",
        reason: "other",
        description: "Some other issue with the service",
      },
    });
    mocks.createDispute.mockRejectedValue("string error");
    const req = createMockRequest("http://localhost/api/disputes", {
      method: "POST",
      body: "{}",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("创建争议失败");
  });
});

describe("GET /api/disputes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
  });

  it("returns auth error when user auth fails", async () => {
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = createMockRequest("http://localhost/api/disputes");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns single dispute by orderId", async () => {
    const dispute = { id: "DSP-1", orderId: "ORD-1", status: "open" };
    mocks.getDispute.mockResolvedValue(dispute);
    const req = createMockRequest("http://localhost/api/disputes?orderId=ORD-1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("DSP-1");
  });

  it("returns 404 when dispute not found", async () => {
    mocks.getDispute.mockResolvedValue(null);
    const req = createMockRequest("http://localhost/api/disputes?orderId=ORD-999");
    const res = await GET(req);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("not found");
  });

  it("lists all user disputes when no orderId", async () => {
    const disputes = [
      { id: "DSP-1", orderId: "ORD-1" },
      { id: "DSP-2", orderId: "ORD-2" },
    ];
    mocks.listUserDisputes.mockResolvedValue(disputes);
    const req = createMockRequest("http://localhost/api/disputes");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.disputes).toHaveLength(2);
  });
});
