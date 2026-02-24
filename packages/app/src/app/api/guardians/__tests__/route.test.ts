import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  addGuardianApplication: vi.fn(),
  rateLimit: vi.fn(),
  getClientIp: vi.fn(),
  parseBody: vi.fn(),
  env: {
    GUARDIAN_RATE_LIMIT_MAX: 5,
    GUARDIAN_RATE_LIMIT_WINDOW_MS: 60000,
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

vi.mock("@/lib/auth/user-auth", () => ({ requireUserAuth: mocks.requireUserAuth }));
vi.mock("@/lib/admin/admin-store", () => ({
  addGuardianApplication: mocks.addGuardianApplication,
}));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit }));
vi.mock("@/lib/shared/api-utils", () => ({ getClientIp: mocks.getClientIp }));
vi.mock("@/lib/shared/api-validation", () => ({ parseBody: mocks.parseBody }));
vi.mock("@/lib/shared/zod-utils", () => ({
  suiAddress: { _type: "string" },
}));
vi.mock("@/lib/env", () => ({ env: mocks.env }));

import { POST } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

function makeReq(url: string, init?: RequestInit) {
  return new Request(url, init);
}

describe("POST /api/guardians", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue(true);
    mocks.getClientIp.mockReturnValue("127.0.0.1");
  });

  it("returns 429 when rate limited", async () => {
    mocks.rateLimit.mockResolvedValue(false);
    const req = makeReq("http://localhost/api/guardians", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("rate_limited");
  });

  it("returns validation error for invalid body", async () => {
    const errResp = { status: 400, json: async () => ({ error: "name required" }) };
    mocks.parseBody.mockResolvedValue({ success: false, response: errResp });
    const req = makeReq("http://localhost/api/guardians", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { name: "Test", contact: "wechat123", userAddress: VALID_ADDRESS },
    });
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = makeReq("http://localhost/api/guardians", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("creates guardian application successfully", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        name: "Test Player",
        contact: "wechat123",
        userAddress: VALID_ADDRESS,
        games: "LOL",
        experience: "3 years",
      },
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.addGuardianApplication.mockResolvedValue(undefined);
    const req = makeReq("http://localhost/api/guardians", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.status).toBe("待审核");
  });

  it("passes correct data to addGuardianApplication", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        name: "Test",
        contact: "wechat",
        userAddress: VALID_ADDRESS,
        games: "DOTA",
      },
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.addGuardianApplication.mockResolvedValue(undefined);
    const req = makeReq("http://localhost/api/guardians", { method: "POST" });
    await POST(req);
    expect(mocks.addGuardianApplication).toHaveBeenCalledTimes(1);
    const arg = mocks.addGuardianApplication.mock.calls[0][0];
    expect(arg.user).toBe("Test");
    expect(arg.userAddress).toBe(VALID_ADDRESS);
    expect(arg.contact).toBe("wechat");
    expect(arg.games).toBe("DOTA");
    expect(arg.status).toBe("待审核");
  });

  it("generates unique application IDs", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { name: "A", contact: "c", userAddress: VALID_ADDRESS },
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.addGuardianApplication.mockResolvedValue(undefined);
    const req1 = makeReq("http://localhost/api/guardians", { method: "POST" });
    const res1 = await POST(req1);
    const body1 = await res1.json();
    const req2 = makeReq("http://localhost/api/guardians", { method: "POST" });
    const res2 = await POST(req2);
    const body2 = await res2.json();
    expect(body1.id).not.toBe(body2.id);
  });

  it("includes optional fields when provided", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        name: "Test",
        contact: "wechat",
        userAddress: VALID_ADDRESS,
        availability: "weekends",
        note: "hello",
      },
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true });
    mocks.addGuardianApplication.mockResolvedValue(undefined);
    const req = makeReq("http://localhost/api/guardians", { method: "POST" });
    await POST(req);
    const arg = mocks.addGuardianApplication.mock.calls[0][0];
    expect(arg.availability).toBe("weekends");
    expect(arg.note).toBe("hello");
  });

  it("calls rateLimit with correct key", async () => {
    mocks.getClientIp.mockReturnValue("1.2.3.4");
    mocks.rateLimit.mockResolvedValue(false);
    const req = makeReq("http://localhost/api/guardians", { method: "POST" });
    await POST(req);
    expect(mocks.rateLimit).toHaveBeenCalledWith("guardians:apply:1.2.3.4", 5, 60000);
  });
});
