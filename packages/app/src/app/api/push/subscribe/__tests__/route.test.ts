import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireUserAuth: vi.fn(),
  savePushSubscription: vi.fn(),
  removePushSubscription: vi.fn(),
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
vi.mock("@/lib/services/push-service", () => ({
  savePushSubscription: mocks.savePushSubscription,
  removePushSubscription: mocks.removePushSubscription,
}));
vi.mock("@/lib/shared/api-validation", () => ({ parseBody: mocks.parseBody }));

import { POST, DELETE } from "../route";

const VALID_ADDRESS = "0x" + "a".repeat(64);

describe("POST /api/push/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns validation error for invalid body", async () => {
    const errResp = { status: 400, json: async () => ({ error: "Invalid" }) };
    mocks.parseBody.mockResolvedValue({ success: false, response: errResp });
    const req = new Request("http://localhost/api/push/subscribe", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        userAddress: VALID_ADDRESS,
        subscription: { endpoint: "https://push.example.com", keys: { p256dh: "k1", auth: "k2" } },
      },
    });
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = new Request("http://localhost/api/push/subscribe", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("subscribes successfully", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: {
        userAddress: VALID_ADDRESS,
        subscription: { endpoint: "https://push.example.com", keys: { p256dh: "k1", auth: "k2" } },
      },
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.savePushSubscription.mockResolvedValue(undefined);
    const req = new Request("http://localhost/api/push/subscribe", { method: "POST" });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

describe("DELETE /api/push/subscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns validation error for invalid body", async () => {
    const errResp = { status: 400, json: async () => ({ error: "Invalid" }) };
    mocks.parseBody.mockResolvedValue({ success: false, response: errResp });
    const req = new Request("http://localhost/api/push/subscribe", { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(400);
  });

  it("returns auth error when user auth fails", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { userAddress: VALID_ADDRESS, endpoint: "https://push.example.com" },
    });
    mocks.requireUserAuth.mockResolvedValue({
      ok: false,
      response: { status: 401, json: async () => ({ error: "unauthorized" }) },
    });
    const req = new Request("http://localhost/api/push/subscribe", { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(401);
  });

  it("unsubscribes successfully", async () => {
    mocks.parseBody.mockResolvedValue({
      success: true,
      data: { userAddress: VALID_ADDRESS, endpoint: "https://push.example.com" },
    });
    mocks.requireUserAuth.mockResolvedValue({ ok: true, address: VALID_ADDRESS });
    mocks.removePushSubscription.mockResolvedValue(undefined);
    const req = new Request("http://localhost/api/push/subscribe", { method: "DELETE" });
    const res = await DELETE(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});
