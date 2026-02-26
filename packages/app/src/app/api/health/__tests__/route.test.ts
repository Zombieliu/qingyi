import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  redisPing: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: mocks.queryRaw },
}));

vi.mock("@/lib/env", () => ({
  env: {
    UPSTASH_REDIS_REST_URL: "https://fake.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "fake-token",
  },
}));

vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: () => ({ ping: mocks.redisPing }),
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
      const res = new MockNextResponse(data, init);
      return res;
    }
  }
  return { NextResponse: MockNextResponse };
});

import { GET } from "../route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns healthy status when database is reachable", async () => {
    mocks.queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const res = await GET(new Request("http://localhost/api/health"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.checks.database.ok).toBe(true);
    expect(typeof body.checks.database.ms).toBe("number");
    expect(body.timestamp).toBeDefined();
    expect(typeof body.responseMs).toBe("number");
  });

  it("returns unhealthy status when database is unreachable", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("Connection refused"));

    const res = await GET(new Request("http://localhost/api/health"));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.status).toBe("unhealthy");
    expect(body.checks.database.ok).toBe(false);
    expect(body.checks.database.error).toBe("Connection refused");
  });

  it("returns degraded when Redis fails but DB is ok", async () => {
    mocks.queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mocks.redisPing.mockRejectedValue(new Error("Redis timeout"));

    const res = await GET(new Request("http://localhost/api/health"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("degraded");
    expect(body.checks.database.ok).toBe(true);
    expect(body.checks.redis.ok).toBe(false);
    expect(body.checks.redis.error).toBe("Redis timeout");
  });

  it("returns healthy when both DB and Redis are ok", async () => {
    mocks.queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mocks.redisPing.mockResolvedValue("PONG");

    const res = await GET(new Request("http://localhost/api/health"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("healthy");
    expect(body.checks.redis.ok).toBe(true);
  });

  it("includes version and environment info", async () => {
    mocks.queryRaw.mockResolvedValue([{ "?column?": 1 }]);

    const res = await GET(new Request("http://localhost/api/health"));
    const body = await res.json();

    expect(body.version).toBeDefined();
    expect(body.environment).toBeDefined();
    expect(typeof body.uptime).toBe("number");
  });
});
