import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    adminOrder: { count: vi.fn(), findMany: vi.fn() },
    adminPlayer: { count: vi.fn(), findMany: vi.fn() },
    ledgerRecord: { count: vi.fn(), findMany: vi.fn() },
    userSession: { count: vi.fn() },
    adminPaymentEvent: { count: vi.fn(), findMany: vi.fn() },
    mantouWallet: { count: vi.fn(), findMany: vi.fn() },
    mantouTransaction: { count: vi.fn(), findMany: vi.fn() },
    referral: { count: vi.fn(), findMany: vi.fn() },
    notification: { count: vi.fn() },
    orderReview: { count: vi.fn() },
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: mocks.prisma }));

import { getBackupStats, exportCriticalData } from "../backup-utils";

function mockAllCounts(value: number) {
  mocks.prisma.adminOrder.count.mockResolvedValue(value);
  mocks.prisma.adminPlayer.count.mockResolvedValue(value);
  mocks.prisma.ledgerRecord.count.mockResolvedValue(value);
  mocks.prisma.userSession.count.mockResolvedValue(value);
  mocks.prisma.adminPaymentEvent.count.mockResolvedValue(value);
  mocks.prisma.mantouWallet.count.mockResolvedValue(value);
  mocks.prisma.mantouTransaction.count.mockResolvedValue(value);
  mocks.prisma.referral.count.mockResolvedValue(value);
  mocks.prisma.notification.count.mockResolvedValue(value);
  mocks.prisma.orderReview.count.mockResolvedValue(value);
}

describe("getBackupStats", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns counts for all tables", async () => {
    mockAllCounts(42);
    const stats = await getBackupStats();
    expect(stats).toEqual({
      orders: 42,
      players: 42,
      ledgerRecords: 42,
      userSessions: 42,
      payments: 42,
      mantouWallets: 42,
      mantouTransactions: 42,
      referrals: 42,
      notifications: 42,
      reviews: 42,
    });
  });

  it("handles zero counts", async () => {
    mockAllCounts(0);
    const stats = await getBackupStats();
    expect(stats.orders).toBe(0);
    expect(stats.players).toBe(0);
  });
});

describe("exportCriticalData", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exports data with stats and records", async () => {
    mockAllCounts(5);
    const fakeOrders = [{ id: "o1" }];
    const fakePlayers = [{ id: "p1" }];
    mocks.prisma.adminOrder.findMany.mockResolvedValue(fakeOrders);
    mocks.prisma.adminPlayer.findMany.mockResolvedValue(fakePlayers);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValue([]);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    mocks.prisma.mantouWallet.findMany.mockResolvedValue([]);
    mocks.prisma.mantouTransaction.findMany.mockResolvedValue([]);
    mocks.prisma.referral.findMany.mockResolvedValue([]);

    const data = await exportCriticalData();

    expect(data.exportedAt).toBeTruthy();
    expect(data.stats.orders).toBe(5);
    expect(data.orders).toEqual(fakeOrders);
    expect(data.players).toEqual(fakePlayers);
    expect(data.ledgerRecords).toEqual([]);
  });

  it("queries orders with date filter", async () => {
    mockAllCounts(0);
    mocks.prisma.adminOrder.findMany.mockResolvedValue([]);
    mocks.prisma.adminPlayer.findMany.mockResolvedValue([]);
    mocks.prisma.ledgerRecord.findMany.mockResolvedValue([]);
    mocks.prisma.adminPaymentEvent.findMany.mockResolvedValue([]);
    mocks.prisma.mantouWallet.findMany.mockResolvedValue([]);
    mocks.prisma.mantouTransaction.findMany.mockResolvedValue([]);
    mocks.prisma.referral.findMany.mockResolvedValue([]);

    await exportCriticalData();

    expect(mocks.prisma.adminOrder.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdAt: { gte: expect.any(Date) } },
        orderBy: { createdAt: "desc" },
      })
    );
    // Players are exported in full (no date filter)
    expect(mocks.prisma.adminPlayer.findMany).toHaveBeenCalledWith();
  });
});
