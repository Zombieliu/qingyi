import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  isAuthorizedCron: vi.fn(),
  trackCronCompleted: vi.fn(),
  trackCronFailed: vi.fn(),
  exportCriticalData: vi.fn(),
  setCache: vi.fn(),
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
vi.mock("@/lib/shared/backup-utils", () => ({
  exportCriticalData: mocks.exportCriticalData,
}));
vi.mock("@/lib/server-cache", () => ({
  setCache: mocks.setCache,
}));
vi.mock("@/lib/business-events", () => ({
  trackCronCompleted: mocks.trackCronCompleted,
  trackCronFailed: mocks.trackCronFailed,
}));

import { GET } from "../route";

function makeReq(url = "http://localhost/api/cron/backup") {
  return new Request(url);
}

const fakeBackupData = {
  exportedAt: "2026-02-25T03:30:00.000Z",
  stats: {
    orders: 100,
    players: 10,
    ledgerRecords: 50,
    userSessions: 20,
    payments: 30,
    mantouWallets: 5,
    mantouTransactions: 15,
    referrals: 8,
    notifications: 40,
    reviews: 12,
  },
  orders: [{ id: "o1" }],
  players: [{ id: "p1" }],
  ledgerRecords: [],
  payments: [],
  mantouWallets: [],
  mantouTransactions: [],
  referrals: [],
};

describe("GET /api/cron/backup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 401 when not authorized", async () => {
    mocks.isAuthorizedCron.mockReturnValue(false);
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("exports backup data successfully", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.exportCriticalData.mockResolvedValue(fakeBackupData);

    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.summary.stats.orders).toBe(100);
    expect(body.summary.counts.orders).toBe(1);
    expect(body.durationMs).toBeTypeOf("number");
  });

  it("stores backup in cache", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.exportCriticalData.mockResolvedValue(fakeBackupData);

    await GET(makeReq());

    expect(mocks.setCache).toHaveBeenCalledTimes(2);
    expect(mocks.setCache).toHaveBeenCalledWith(
      "backup:latest",
      fakeBackupData,
      expect.any(Number)
    );
    expect(mocks.setCache).toHaveBeenCalledWith(
      "backup:summary",
      expect.objectContaining({ exportedAt: fakeBackupData.exportedAt }),
      expect.any(Number)
    );
  });

  it("tracks cron completion", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.exportCriticalData.mockResolvedValue(fakeBackupData);

    await GET(makeReq());

    expect(mocks.trackCronCompleted).toHaveBeenCalledWith(
      "backup",
      expect.objectContaining({ orders: 1 }),
      expect.any(Number)
    );
  });

  it("returns 500 and tracks failure on error", async () => {
    mocks.isAuthorizedCron.mockReturnValue(true);
    mocks.exportCriticalData.mockRejectedValue(new Error("db timeout"));

    const res = await GET(makeReq());
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("backup_failed");
    expect(body.message).toBe("db timeout");
    expect(mocks.trackCronFailed).toHaveBeenCalledWith("backup", "db timeout");
  });
});
