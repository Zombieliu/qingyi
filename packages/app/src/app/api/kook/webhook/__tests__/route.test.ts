import { describe, it, expect, vi, beforeEach } from "vitest";

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

vi.mock("server-only", () => ({}));

const originalEnv = process.env;

describe("POST /api/kook/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.KOOK_VERIFY_TOKEN = "test-token";
    process.env.NODE_ENV = "test";
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  async function loadRoute() {
    return await import("../route");
  }

  function makeReq(body: unknown) {
    return new Request("http://localhost/api/kook/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("responds to challenge verification", async () => {
    const { POST } = await loadRoute();
    const req = makeReq({
      s: 0,
      d: { type: 255, channel_type: "WEBHOOK_CHALLENGE", challenge: "abc123" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.challenge).toBe("abc123");
  });

  it("returns 401 for invalid verify token", async () => {
    const { POST } = await loadRoute();
    const req = makeReq({
      s: 0,
      d: { type: 1, content: "/status", author_id: "user1", verify_token: "wrong-token" },
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("invalid token");
  });

  it("accepts valid verify token and handles message", async () => {
    const { POST } = await loadRoute();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const req = makeReq({
      s: 0,
      d: { type: 1, content: "/status", author_id: "user1", verify_token: "test-token" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"command":"status"'));
    consoleSpy.mockRestore();
  });

  it("handles /help command", async () => {
    const { POST } = await loadRoute();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const req = makeReq({
      s: 0,
      d: { type: 1, content: "/help", author_id: "user2", verify_token: "test-token" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('"command":"help"'));
    consoleSpy.mockRestore();
  });

  it("handles unknown commands gracefully", async () => {
    const { POST } = await loadRoute();
    const req = makeReq({
      s: 0,
      d: { type: 1, content: "/unknown", author_id: "user1", verify_token: "test-token" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("handles non-command messages", async () => {
    const { POST } = await loadRoute();
    const req = makeReq({
      s: 0,
      d: { type: 1, content: "hello world", author_id: "user1", verify_token: "test-token" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("returns 400 for invalid JSON", async () => {
    const { POST } = await loadRoute();
    const req = new Request("http://localhost/api/kook/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid request");
  });

  it("returns 503 when KOOK_VERIFY_TOKEN not configured in production", async () => {
    process.env.KOOK_VERIFY_TOKEN = "";
    process.env.NODE_ENV = "production";
    const { POST } = await loadRoute();
    const req = makeReq({
      s: 0,
      d: { type: 1, content: "hello", author_id: "user1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("KOOK_VERIFY_TOKEN not configured");
  });

  it("handles non-message event types", async () => {
    const { POST } = await loadRoute();
    const req = makeReq({
      s: 0,
      d: { type: 9, verify_token: "test-token" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("skips token check when KOOK_VERIFY_TOKEN is empty in non-production", async () => {
    process.env.KOOK_VERIFY_TOKEN = "";
    process.env.NODE_ENV = "test";
    const { POST } = await loadRoute();
    const req = makeReq({
      s: 0,
      d: { type: 1, content: "hello", author_id: "user1" },
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
