import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  recordGrowthEvent: vi.fn(),
  rateLimit: vi.fn(),
  getClientIp: vi.fn(),
  parseBodyRaw: vi.fn(),
  requireUserAuth: vi.fn(),
  env: {
    TRACK_RATE_LIMIT_MAX: 100,
    TRACK_RATE_LIMIT_WINDOW_MS: 60000,
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

vi.mock("@/lib/analytics-store", () => ({ recordGrowthEvent: mocks.recordGrowthEvent }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/shared/api-utils", () => ({ getClientIp: mocks.getClientIp }));
vi.mock("@/lib/shared/api-validation", () => ({ parseBodyRaw: mocks.parseBodyRaw }));
vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/auth/user-auth", () => ({ requireUserAuth: mocks.requireUserAuth }));

import { POST, GET } from "../route";

function makeReq(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("POST /api/track", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(true);
    mocks.getClientIp.mockReturnValue("127.0.0.1");
  });
  it("returns 429 when rate limited", async () => {
    mocks.rateLimit.mockResolvedValue(false);
    const req = makeReq("http://localhost/api/track", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
  });

  it("returns validation error for invalid body", async () => {
    const errResp = { status: 400, json: async () => ({ error: "Invalid" }) };
    mocks.parseBodyRaw.mockResolvedValue({ success: false, response: errResp });
    const req = makeReq("http://localhost/api/track", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("tracks event successfully without userAddress", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { event: "page_view", path: "/home" },
      rawBody: "{}",
    });
    mocks.recordGrowthEvent.mockResolvedValue(undefined);
    const req = makeReq("http://localhost/api/track", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mocks.recordGrowthEvent).toHaveBeenCalled();
  });

  it("requires auth when userAddress is provided", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { event: "click", userAddress: "0xabc" },
      rawBody: "{}",
    });
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq("http://localhost/api/track", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("returns 500 when recordGrowthEvent fails", async () => {
    mocks.parseBodyRaw.mockResolvedValue({
      success: true,
      data: { event: "page_view" },
      rawBody: "{}",
    });
    mocks.recordGrowthEvent.mockRejectedValue(new Error("db error"));
    const req = makeReq("http://localhost/api/track", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("persist_failed");
  });
});

describe("GET /api/track", () => {
  it("returns ok", async () => {
    const req = makeReq("http://localhost/api/track");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
