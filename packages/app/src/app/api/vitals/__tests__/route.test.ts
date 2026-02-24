import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getCacheAsync: vi.fn(),
  setCache: vi.fn(),
  alertOnVital: vi.fn(),
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
vi.mock("@/lib/server-cache", () => ({
  getCacheAsync: mocks.getCacheAsync,
  setCache: mocks.setCache,
}));
vi.mock("@/lib/services/alert-service", () => ({
  alertOnVital: mocks.alertOnVital,
}));

import { POST, GET } from "../route";

function makeReq(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("POST /api/vitals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCacheAsync.mockResolvedValue(null);
  });
  it("records vital and returns ok", async () => {
    const req = makeReq("http://localhost/api/vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "LCP", value: 2500, rating: "good", page: "/home" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("triggers alert for poor rating", async () => {
    mocks.alertOnVital.mockResolvedValue(undefined);
    mocks.getCacheAsync.mockResolvedValue(null);
    const req = makeReq("http://localhost/api/vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "CLS", value: 0.5, rating: "poor", page: "/home" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // Wait for dynamic import promise to resolve
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.alertOnVital).toHaveBeenCalledWith("CLS", 0.5, "/home");
  });

  it("handles Redis cache with existing entries", async () => {
    mocks.getCacheAsync.mockResolvedValue({
      value: JSON.stringify([{ name: "FID", value: 100, rating: "good", page: "/", timestamp: 1 }]),
    });
    const req = makeReq("http://localhost/api/vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "LCP", value: 2500, rating: "good", page: "/home" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(mocks.setCache).toHaveBeenCalled();
  });

  it("handles Redis failure gracefully in POST", async () => {
    mocks.getCacheAsync.mockRejectedValue(new Error("Redis down"));
    const req = makeReq("http://localhost/api/vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "FCP", value: 1800, rating: "good", page: "/about" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("handles alertOnVital failure gracefully", async () => {
    mocks.alertOnVital.mockRejectedValue(new Error("alert failed"));
    mocks.getCacheAsync.mockResolvedValue(null);
    const req = makeReq("http://localhost/api/vitals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "INP", value: 500, rating: "poor", page: "/shop" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    // Wait for dynamic import promise
    await new Promise((r) => setTimeout(r, 50));
  });

  it("returns 400 for invalid JSON", async () => {
    const req = makeReq("http://localhost/api/vitals", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});

describe("GET /api/vitals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when admin auth fails", async () => {
    mocks.requireAdmin.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq("http://localhost/api/vitals");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns summary when admin auth succeeds", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, role: "viewer" });
    mocks.getCacheAsync.mockResolvedValue({
      value: JSON.stringify([
        { name: "LCP", value: 2500, rating: "good", page: "/home", timestamp: Date.now() },
        { name: "LCP", value: 4000, rating: "poor", page: "/home", timestamp: Date.now() },
      ]),
    });
    const req = makeReq("http://localhost/api/vitals");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toBeDefined();
    expect(body.totalEntries).toBe(2);
  });

  it("returns summary with needs_improvement rating", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, role: "viewer" });
    mocks.getCacheAsync.mockResolvedValue({
      value: JSON.stringify([
        {
          name: "LCP",
          value: 3000,
          rating: "needs-improvement",
          page: "/home",
          timestamp: Date.now(),
        },
      ]),
    });
    const req = makeReq("http://localhost/api/vitals");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary[0].needs_improvement).toBe(1);
  });

  it("returns 500 when GET handler throws", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("boom"));
    const req = makeReq("http://localhost/api/vitals");
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("failed");
  });

  it("returns empty summary when no entries", async () => {
    mocks.requireAdmin.mockResolvedValue({ ok: true, role: "viewer" });
    mocks.getCacheAsync.mockResolvedValue(null);
    const req = makeReq("http://localhost/api/vitals");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary).toEqual([]);
    expect(body.totalEntries).toBe(0);
  });
});
