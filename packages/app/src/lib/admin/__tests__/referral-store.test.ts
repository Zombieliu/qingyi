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
