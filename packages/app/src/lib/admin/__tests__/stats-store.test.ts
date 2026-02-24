import { describe, it, expect, vi, beforeEach } from "vitest";

const mockOrderCount = vi.fn();
const mockPlayerCount = vi.fn();
const mockAnnouncementCount = vi.fn();
const mockOrderAggregate = vi.fn();

vi.mock("../admin-store-utils", () => ({
  prisma: {
    adminOrder: {
      count: (...args: unknown[]) => mockOrderCount(...args),
      aggregate: (...args: unknown[]) => mockOrderAggregate(...args),
    },
    adminPlayer: {
      count: (...args: unknown[]) => mockPlayerCount(...args),
    },
    adminAnnouncement: {
      count: (...args: unknown[]) => mockAnnouncementCount(...args),
    },
  },
}));

import { getAdminStats } from "../stats-store";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getAdminStats", () => {
  it("returns all stats", async () => {
    mockOrderCount
      .mockResolvedValueOnce(100) // totalOrders
      .mockResolvedValueOnce(15); // pendingOrders
    mockPlayerCount.mockResolvedValue(50);
    mockAnnouncementCount.mockResolvedValue(5);
    mockOrderAggregate.mockResolvedValue({
      _count: 80,
      _sum: { amount: 9999.99, serviceFee: 500.5 },
    });

    const result = await getAdminStats();

    expect(result.totalOrders).toBe(100);
    expect(result.pendingOrders).toBe(15);
    expect(result.activePlayers).toBe(50);
    expect(result.publishedAnnouncements).toBe(5);
    expect(result.completedOrders).toBe(80);
    expect(result.totalRevenue).toBe(9999.99);
    expect(result.totalServiceFee).toBe(500.5);
  });

  it("handles null sums gracefully", async () => {
    mockOrderCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockPlayerCount.mockResolvedValue(0);
    mockAnnouncementCount.mockResolvedValue(0);
    mockOrderAggregate.mockResolvedValue({
      _count: 0,
      _sum: { amount: null, serviceFee: null },
    });

    const result = await getAdminStats();

    expect(result.totalOrders).toBe(0);
    expect(result.totalRevenue).toBe(0);
    expect(result.totalServiceFee).toBe(0);
    expect(result.completedOrders).toBe(0);
  });

  it("rounds revenue to 2 decimal places", async () => {
    mockOrderCount.mockResolvedValueOnce(10).mockResolvedValueOnce(2);
    mockPlayerCount.mockResolvedValue(5);
    mockAnnouncementCount.mockResolvedValue(1);
    mockOrderAggregate.mockResolvedValue({
      _count: 8,
      _sum: { amount: 123.456, serviceFee: 12.345 },
    });

    const result = await getAdminStats();

    expect(result.totalRevenue).toBe(123.46);
    expect(result.totalServiceFee).toBe(12.35);
  });

  it("handles zero counts", async () => {
    mockOrderCount.mockResolvedValueOnce(0).mockResolvedValueOnce(0);
    mockPlayerCount.mockResolvedValue(0);
    mockAnnouncementCount.mockResolvedValue(0);
    mockOrderAggregate.mockResolvedValue({
      _count: 0,
      _sum: { amount: null, serviceFee: null },
    });

    const result = await getAdminStats();

    expect(result.totalOrders).toBe(0);
    expect(result.pendingOrders).toBe(0);
    expect(result.activePlayers).toBe(0);
    expect(result.publishedAnnouncements).toBe(0);
  });
});
