import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  isAuthorizedCron: vi.fn(),
  trackCronCompleted: vi.fn(),
  trackCronFailed: vi.fn(),
  prisma: {
    growthEvent: { deleteMany: vi.fn() },
    userSession: { deleteMany: vi.fn() },
    adminSession: { deleteMany: vi.fn() },
    notification: { deleteMany: vi.fn() },
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

vi.mock("server-only", () => ({}));
vi.mock("@/lib/cron-auth", () => ({
  isAuthorizedCron: mocks.isAuthorizedCron,
}));
vi.mock("@/lib/db", () => ({
  prisma: mocks.prisma,
}));
vi.mock("@/lib/business-events", () => ({
  trackCronCompleted: mocks.trackCronCompleted,
  trackCronFailed: mocks.trackCronFailed,
}));

import { GET } from "../route";

function makeReq(url = "http://localhost/api/cron/cleanup") {
  return new Request(url);
}

describe("GET /api/cron/cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authorized", async () => {
    mocks.isAuthorizedCron.mockReturnValue(false);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("cleans up data successfully", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.prisma.growthEvent.deleteMany.mockResolvedValue({ count: 10 });
    mocks.prisma.userSession.deleteMany.mockResolvedValue({ count: 5 });
    mocks.prisma.adminSession.deleteMany.mockResolvedValue({ count: 3 });
    mocks.prisma.notification.deleteMany.mockResolvedValue({ count: 7 });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.cleaned.growthEvents).toBe(10);
    expect(body.cleaned.userSessions).toBe(5);
    expect(body.cleaned.adminSessions).toBe(3);
    expect(body.cleaned.notifications).toBe(7);
    expect(body.durationMs).toBeTypeOf("number");
  });

  it("tracks cron completion on success", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.prisma.growthEvent.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.userSession.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.adminSession.deleteMany.mockResolvedValue({ count: 0 });
    mocks.prisma.notification.deleteMany.mockResolvedValue({ count: 0 });
    await GET(makeReq());
    expect(mocks.trackCronCompleted).toHaveBeenCalledWith(
      "cleanup",
      expect.objectContaining({ growthEvents: 0, userSessions: 0 }),
      expect.any(Number)
    );
  });

  it("returns 500 and tracks failure on error", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.prisma.growthEvent.deleteMany.mockRejectedValue(new Error("db error"));
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("cleanup_failed");
    expect(body.message).toBe("db error");
    expect(mocks.trackCronFailed).toHaveBeenCalledWith("cleanup", "db error");
  });
});
