import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getBackupStats: vi.fn(),
  getCacheAsync: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/admin/admin-auth", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/lib/shared/backup-utils", () => ({
  getBackupStats: mocks.getBackupStats,
}));
vi.mock("@/lib/server-cache", () => ({
  getCacheAsync: mocks.getCacheAsync,
}));

import { GET } from "../route";

const authOk = { ok: true, role: "viewer", authType: "session" };
const authFail = {
  ok: false,
  response: Response.json({ error: "unauthorized" }, { status: 401 }),
};

const fakeStats = {
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
};

describe("GET /api/admin/backup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(authOk);
    mocks.getBackupStats.mockResolvedValue(fakeStats);
    mocks.getCacheAsync.mockResolvedValue(null);
  });

  it("returns 401 when auth fails", async () => {
    mocks.requireAdmin.mockResolvedValue(authFail);
    const res = await GET(new Request("http://localhost/api/admin/backup"));
    expect(res.status).toBe(401);
  });

  it("returns current stats with no previous backup", async () => {
    const res = await GET(new Request("http://localhost/api/admin/backup"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.lastBackup).toBeNull();
    expect(body.currentStats).toEqual(fakeStats);
  });

  it("returns last backup summary when available", async () => {
    const summary = {
      exportedAt: "2026-02-25T03:30:00.000Z",
      stats: fakeStats,
      counts: { orders: 10 },
    };
    mocks.getCacheAsync.mockResolvedValue({ value: summary, expiresAt: Date.now() + 100000 });

    const res = await GET(new Request("http://localhost/api/admin/backup"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastBackup).toEqual(summary);
    expect(body.currentStats).toEqual(fakeStats);
  });

  it("returns 500 on error", async () => {
    mocks.getBackupStats.mockRejectedValue(new Error("db error"));
    const res = await GET(new Request("http://localhost/api/admin/backup"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("backup_status_failed");
  });
});
