import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
const mockFindFirst = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockFindMany = vi.fn();
const mockFindUnique = vi.fn();
const mockGrowthFindFirst = vi.fn();
const mockGrowthCreate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    adminMember: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    adminMembershipTier: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    growthEvent: {
      findFirst: (...args: unknown[]) => mockGrowthFindFirst(...args),
      create: (...args: unknown[]) => mockGrowthCreate(...args),
    },
  },
}));

vi.mock("@/lib/business-events", () => ({
  trackEvent: vi.fn(),
}));

import {
  addPointsAndUpgrade,
  onOrderCompleted,
  onReviewSubmitted,
  onDailyCheckin,
  getUserLevelProgress,
  POINTS_RULES,
} from "@/lib/services/growth-service";

const baseMember = {
  id: "MBR-1",
  userAddress: "0xabc",
  userName: null,
  tierId: null,
  tierName: null,
  points: 0,
  status: "active",
  expiresAt: null,
  note: null,
  createdAt: new Date(),
  updatedAt: null,
};

const tiers = [
  {
    id: "T1",
    name: "白银",
    level: 1,
    badge: "🥈",
    minPoints: 100,
    status: "上架",
    price: null,
    durationDays: null,
    perks: null,
    createdAt: new Date(),
    updatedAt: null,
  },
  {
    id: "T2",
    name: "黄金",
    level: 2,
    badge: "🥇",
    minPoints: 500,
    status: "上架",
    price: null,
    durationDays: null,
    perks: null,
    createdAt: new Date(),
    updatedAt: null,
  },
  {
    id: "T3",
    name: "钻石",
    level: 3,
    badge: "💎",
    minPoints: 2000,
    status: "上架",
    price: null,
    durationDays: null,
    perks: null,
    createdAt: new Date(),
    updatedAt: null,
  },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("addPointsAndUpgrade", () => {
  it("creates member if not exists and adds points", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockResolvedValue({ ...baseMember, points: 0 });
    mockUpdate.mockResolvedValue({ ...baseMember, points: 50 });
    mockFindMany.mockResolvedValue(tiers);

    const result = await addPointsAndUpgrade({
      userAddress: "0xabc",
      points: 50,
      reason: "order_complete",
    });

    expect(result).not.toBeNull();
    expect(result!.earned).toBe(50);
    expect(result!.points).toBe(50);
    expect(result!.multiplier).toBe(1);
    expect(mockCreate).toHaveBeenCalled();
  });

  it("applies VIP multiplier", async () => {
    const vipMember = {
      ...baseMember,
      tierId: "T1",
      status: "active",
      expiresAt: new Date(Date.now() + 86400_000),
      points: 100,
    };
    mockFindFirst.mockResolvedValue(vipMember);
    mockUpdate.mockResolvedValue({ ...vipMember, points: 175 });
    mockFindMany.mockResolvedValue(tiers);
    mockFindUnique.mockResolvedValue(vipMember);

    const result = await addPointsAndUpgrade({
      userAddress: "0xabc",
      points: 50,
      reason: "order_complete",
    });

    expect(result!.multiplier).toBe(POINTS_RULES.VIP_MULTIPLIER);
    expect(result!.earned).toBe(75); // 50 * 1.5
  });

  it("auto-upgrades when points reach threshold", async () => {
    mockFindFirst.mockResolvedValue({ ...baseMember, points: 80 });
    mockUpdate
      .mockResolvedValueOnce({ ...baseMember, points: 130 }) // points update
      .mockResolvedValueOnce({ ...baseMember, points: 130, tierId: "T1", tierName: "白银" }); // tier upgrade
    mockFindMany.mockResolvedValue(tiers);
    mockFindUnique.mockResolvedValue({ ...baseMember, points: 130 });

    const result = await addPointsAndUpgrade({
      userAddress: "0xabc",
      points: 50,
      reason: "order_complete",
    });

    expect(result!.upgraded).not.toBeNull();
    expect(result!.upgraded!.tierName).toBe("白银");
  });

  it("does not downgrade", async () => {
    const goldMember = { ...baseMember, tierId: "T2", tierName: "黄金", points: 200 };
    mockFindFirst.mockResolvedValue(goldMember);
    mockUpdate.mockResolvedValue({ ...goldMember, points: 210 });
    mockFindMany.mockResolvedValue(tiers);
    mockFindUnique.mockResolvedValue({ ...goldMember, points: 210 });

    const result = await addPointsAndUpgrade({
      userAddress: "0xabc",
      points: 10,
      reason: "daily_checkin",
    });

    // Points 210 qualifies for 白银 (100) but already 黄金 (500), should not downgrade
    expect(result!.upgraded).toBeNull();
  });

  it("returns null for zero points", async () => {
    const result = await addPointsAndUpgrade({
      userAddress: "0xabc",
      points: 0,
      reason: "test",
    });
    expect(result).toBeNull();
  });
});

describe("onOrderCompleted", () => {
  it("awards points based on order amount", async () => {
    mockFindFirst.mockResolvedValue({ ...baseMember, points: 0 });
    mockUpdate.mockResolvedValue({ ...baseMember, points: 88 });
    mockFindMany.mockResolvedValue([]);

    const result = await onOrderCompleted({
      userAddress: "0xabc",
      amount: 88,
      orderId: "ORD-1",
    });

    expect(result!.earned).toBe(88);
  });
});

describe("onReviewSubmitted", () => {
  it("awards review points", async () => {
    mockFindFirst.mockResolvedValue({ ...baseMember, points: 100 });
    mockUpdate.mockResolvedValue({ ...baseMember, points: 120 });
    mockFindMany.mockResolvedValue([]);

    const result = await onReviewSubmitted({
      userAddress: "0xabc",
      orderId: "ORD-1",
    });

    expect(result!.earned).toBe(POINTS_RULES.REVIEW);
  });
});

describe("onDailyCheckin", () => {
  it("awards checkin points", async () => {
    mockGrowthFindFirst.mockResolvedValue(null); // not checked in today
    mockGrowthCreate.mockResolvedValue({ id: "GE-1" });
    mockFindFirst.mockResolvedValue({ ...baseMember, points: 50 });
    mockUpdate.mockResolvedValue({ ...baseMember, points: 60 });
    mockFindMany.mockResolvedValue([]);

    const result = await onDailyCheckin("0xabc");

    expect(result!.earned).toBe(POINTS_RULES.DAILY_CHECKIN);
  });

  it("rejects duplicate checkin", async () => {
    mockGrowthFindFirst.mockResolvedValue({ id: "GE-existing" }); // already checked in

    const result = await onDailyCheckin("0xabc");

    expect(result).toHaveProperty("alreadyCheckedIn", true);
    expect(result!.earned).toBe(0);
  });
});

describe("getUserLevelProgress", () => {
  it("returns progress with next tier info", async () => {
    mockFindFirst.mockResolvedValue({ ...baseMember, tierId: "T1", points: 250 });
    mockFindMany.mockResolvedValue(tiers);

    const progress = await getUserLevelProgress("0xabc");

    expect(progress.points).toBe(250);
    expect(progress.currentTier?.name).toBe("白银");
    expect(progress.nextTier?.name).toBe("黄金");
    expect(progress.pointsToNext).toBe(250); // 500 - 250
    expect(progress.progress).toBe(38); // (250-100)/(500-100) = 37.5 → 38
    expect(progress.isVip).toBe(true);
  });

  it("returns null tier for new user", async () => {
    mockFindFirst.mockResolvedValue(null);
    mockFindMany.mockResolvedValue(tiers);

    const progress = await getUserLevelProgress("0xnew");

    expect(progress.points).toBe(0);
    expect(progress.currentTier).toBeNull();
    expect(progress.nextTier?.name).toBe("白银");
    expect(progress.pointsToNext).toBe(100);
  });
});
