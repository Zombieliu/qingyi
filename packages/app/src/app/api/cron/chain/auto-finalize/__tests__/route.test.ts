import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  autoFinalizeChainOrdersSummary: vi.fn(),
  acquireCronLock: vi.fn(),
  isAuthorizedCron: vi.fn(),
  env: {
    CRON_LOCK_TTL_MS: 60000,
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
vi.mock("@/lib/chain/chain-auto-finalize", () => ({
  autoFinalizeChainOrdersSummary: mocks.autoFinalizeChainOrdersSummary,
}));
vi.mock("@/lib/cron-lock", () => ({
  acquireCronLock: mocks.acquireCronLock,
}));
vi.mock("@/lib/cron-auth", () => ({
  isAuthorizedCron: mocks.isAuthorizedCron,
}));
vi.mock("@/lib/env", () => ({ env: mocks.env }));

import { GET } from "../route";

function makeReq(url = "http://localhost/api/cron/chain/auto-finalize") {
  return new Request(url);
}

describe("GET /api/cron/chain/auto-finalize", () => {
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

  it("returns 429 when lock cannot be acquired", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(false);
    const res = await GET(makeReq());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("locked");
  });

  it("calls acquireCronLock with correct params", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.autoFinalizeChainOrdersSummary.mockResolvedValue({});
    await GET(makeReq());
    expect(mocks.acquireCronLock).toHaveBeenCalledWith("chain-auto-finalize", 60000);
  });

  it("returns success with result data", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.autoFinalizeChainOrdersSummary.mockResolvedValue({ finalized: 2, total: 8 });
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.finalized).toBe(2);
    expect(body.total).toBe(8);
  });

  it("returns 500 when auto finalize fails", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.autoFinalizeChainOrdersSummary.mockRejectedValue(new Error("finalize error"));
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("auto finalize failed");
  });

  it("returns generic error message when error has no message", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.acquireCronLock.mockResolvedValue(true);
    mocks.autoFinalizeChainOrdersSummary.mockRejectedValue(new Error(""));
    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("auto finalize failed");
  });
});
