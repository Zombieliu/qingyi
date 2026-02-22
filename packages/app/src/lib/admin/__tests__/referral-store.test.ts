import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockCount = vi.fn();
const mockGroupBy = vi.fn();
const mockUpsert = vi.fn();

vi.mock("../admin-store-utils", () => ({
  prisma: {
    referral: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      count: (...args: unknown[]) => mockCount(...args),
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
    },
    referralConfig: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      upsert: (...args: unknown[]) => mockUpsert(...args),
    },
    adminOrder: {
      groupBy: (...args: unknown[]) => mockGroupBy(...args),
    },
  },
  Prisma: {},
}));

vi.mock("../mantou-store", () => ({
  creditMantou: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock("../../server-cache", () => ({
  getCache: vi.fn().mockReturnValue(null),
  setCache: vi.fn(),
}));

vi.mock("@date-fns/tz", () => ({
  TZDate: class {
    constructor() {
      return new Date();
    }
  },
}));

vi.mock("date-fns", () => ({
  startOfWeek: () => new Date("2026-01-01"),
  startOfMonth: () => new Date("2026-01-01"),
}));

import {
  bindReferral,
  getReferralByInvitee,
  queryReferralsByInviter,
  getReferralConfig,
  processReferralReward,
  queryReferrals,
} from "../referral-store";

beforeEach(() => {
  vi.clearAllMocks();
});

const baseReferral = {
  id: "REF-1",
  inviterAddress: "0xinviter",
  inviteeAddress: "0xinvitee",
  status: "pending",
  rewardInviter: null,
  rewardInvitee: null,
  triggerOrderId: null,
  createdAt: new Date(),
  rewardedAt: null,
};

describe("bindReferral", () => {
  it("creates new referral", async () => {
    mockFindUnique.mockResolvedValue(null);
    mockCreate.mockResolvedValue(baseReferral);

    const result = await bindReferral("0xinviter", "0xinvitee");
    expect(result.duplicated).toBe(false);
    expect(result.referral.inviterAddress).toBe("0xinviter");
  });

  it("returns existing referral as duplicate", async () => {
    mockFindUnique.mockResolvedValue(baseReferral);

    const result = await bindReferral("0xinviter", "0xinvitee");
    expect(result.duplicated).toBe(true);
  });

  it("throws on self-referral", async () => {
    await expect(bindReferral("0xsame", "0xsame")).rejects.toThrow("cannot_self_refer");
  });
});

describe("getReferralByInvitee", () => {
  it("returns referral if exists", async () => {
    mockFindUnique.mockResolvedValue(baseReferral);
    const result = await getReferralByInvitee("0xinvitee");
    expect(result).not.toBeNull();
    expect(result!.inviterAddress).toBe("0xinviter");
  });

  it("returns null if not found", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await getReferralByInvitee("0xnobody");
    expect(result).toBeNull();
  });
});

describe("queryReferralsByInviter", () => {
  it("returns list of referrals", async () => {
    mockFindMany.mockResolvedValue([baseReferral]);
    const result = await queryReferralsByInviter("0xinviter");
    expect(result).toHaveLength(1);
  });
});

describe("getReferralConfig", () => {
  it("returns default config when none exists", async () => {
    mockFindUnique.mockResolvedValue(null);
    const config = await getReferralConfig();
    expect(config.mode).toBe("fixed");
    expect(config.fixedInviter).toBe(50);
    expect(config.enabled).toBe(true);
  });

  it("returns stored config", async () => {
    mockFindUnique.mockResolvedValue({
      id: "default",
      mode: "percent",
      fixedInviter: 100,
      fixedInvitee: 50,
      percentInviter: 0.1,
      percentInvitee: 0.05,
      enabled: false,
      updatedAt: new Date(),
    });
    const config = await getReferralConfig();
    expect(config.mode).toBe("percent");
    expect(config.enabled).toBe(false);
  });
});

describe("processReferralReward", () => {
  it("returns null if no referral exists", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await processReferralReward("ORD-1", "0xnobody", 100);
    expect(result).toBeNull();
  });

  it("returns null if referral already rewarded", async () => {
    mockFindUnique.mockResolvedValue({ ...baseReferral, status: "rewarded" });
    const result = await processReferralReward("ORD-1", "0xinvitee", 100);
    expect(result).toBeNull();
  });

  it("processes reward for pending referral (fixed mode)", async () => {
    // First findUnique: referral lookup
    mockFindUnique
      .mockResolvedValueOnce({ ...baseReferral, status: "pending" })
      // Second findUnique: config lookup
      .mockResolvedValueOnce(null); // use default config
    mockUpdate.mockResolvedValue({ ...baseReferral, status: "rewarded" });

    const result = await processReferralReward("ORD-1", "0xinvitee", 100);
    expect(result).not.toBeNull();
    expect(result!.inviterReward).toBe(50); // default fixedInviter
    expect(result!.inviteeReward).toBe(30); // default fixedInvitee
  });
});

describe("queryReferrals", () => {
  it("returns paginated referrals", async () => {
    mockCount.mockResolvedValue(15);
    mockFindMany.mockResolvedValue([baseReferral]);

    const result = await queryReferrals({ page: 1, pageSize: 10 });
    expect(result.total).toBe(15);
    expect(result.items).toHaveLength(1);
    expect(result.totalPages).toBe(2);
  });

  it("filters by status", async () => {
    mockCount.mockResolvedValue(5);
    mockFindMany.mockResolvedValue([]);

    const result = await queryReferrals({ page: 1, pageSize: 10, status: "rewarded" });
    expect(result.total).toBe(5);
  });

  it("filters by keyword", async () => {
    mockCount.mockResolvedValue(1);
    mockFindMany.mockResolvedValue([baseReferral]);

    const result = await queryReferrals({ page: 1, pageSize: 10, q: "0xinviter" });
    expect(result.items).toHaveLength(1);
  });
});

describe("getLeaderboard", () => {
  it("returns spend leaderboard", async () => {
    mockGroupBy.mockResolvedValue([
      { userAddress: "0xuser1", _sum: { amount: 500 } },
      { userAddress: "0xuser2", _sum: { amount: 300 } },
    ]);
    const { getLeaderboard } = await import("../referral-store");
    const entries = await getLeaderboard("spend", "all", 10);
    expect(entries).toHaveLength(2);
    expect(entries[0].rank).toBe(1);
    expect(entries[0].value).toBe(500);
  });

  it("returns companion leaderboard", async () => {
    mockGroupBy.mockResolvedValue([
      { companionAddress: "0xcomp1", _count: { id: 10 }, _sum: { amount: 1000 } },
    ]);
    const { getLeaderboard } = await import("../referral-store");
    const entries = await getLeaderboard("companion", "week", 10);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe(10);
  });

  it("returns referral leaderboard", async () => {
    mockGroupBy.mockResolvedValue([{ inviterAddress: "0xinv1", _count: { id: 5 } }]);
    const { getLeaderboard } = await import("../referral-store");
    const entries = await getLeaderboard("referral", "month", 10);
    expect(entries).toHaveLength(1);
    expect(entries[0].value).toBe(5);
  });
});

describe("updateReferralConfig", () => {
  it("upserts config", async () => {
    mockUpsert.mockResolvedValue({
      id: "default",
      mode: "percent",
      fixedInviter: 100,
      fixedInvitee: 50,
      percentInviter: 0.1,
      percentInvitee: 0.05,
      enabled: true,
      updatedAt: new Date(),
    });
    const { updateReferralConfig } = await import("../referral-store");
    const config = await updateReferralConfig({ mode: "percent", fixedInviter: 100 });
    expect(config.mode).toBe("percent");
    expect(mockUpsert).toHaveBeenCalled();
  });
});

describe("processReferralReward percent mode", () => {
  it("calculates percent rewards", async () => {
    mockFindUnique
      .mockResolvedValueOnce({ ...baseReferral, status: "pending" })
      .mockResolvedValueOnce({
        id: "default",
        mode: "percent",
        fixedInviter: 50,
        fixedInvitee: 30,
        percentInviter: 0.1,
        percentInvitee: 0.05,
        enabled: true,
        updatedAt: new Date(),
      });
    mockUpdate.mockResolvedValue({ ...baseReferral, status: "rewarded" });

    const { processReferralReward } = await import("../referral-store");
    const result = await processReferralReward("ORD-1", "0xinvitee", 1000);
    expect(result).not.toBeNull();
    expect(result!.inviterReward).toBe(100); // 1000 * 0.1
    expect(result!.inviteeReward).toBe(50); // 1000 * 0.05
  });
});

describe("processReferralReward disabled", () => {
  it("returns null when config disabled", async () => {
    mockFindUnique
      .mockResolvedValueOnce({ ...baseReferral, status: "pending" })
      .mockResolvedValueOnce({
        id: "default",
        mode: "fixed",
        fixedInviter: 50,
        fixedInvitee: 30,
        percentInviter: 0.05,
        percentInvitee: 0.03,
        enabled: false,
        updatedAt: null,
      });

    const { processReferralReward } = await import("../referral-store");
    const result = await processReferralReward("ORD-1", "0xinvitee", 100);
    expect(result).toBeNull();
  });
});
