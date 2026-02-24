import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks (must be declared via vi.hoisted so vi.mock factories can reference them) ──
const {
  mockPrismaRedeemCode,
  mockPrismaRedeemRecord,
  mockPrismaRedeemBatch,
  mockTxRedeemCode,
  mockTxRedeemRecord,
  mockTxRedeemBatch,
  mockCreditMantou,
  mockCreditLedgerWithAdmin,
  mockGetCouponByCode,
  mockGetCouponById,
  mockGetMemberByAddress,
  mockGetMembershipTierById,
  mockListActiveMembershipTiers,
  mockUpdateMember,
  mockAddMember,
} = vi.hoisted(() => ({
  mockPrismaRedeemCode: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  mockPrismaRedeemRecord: {
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  mockPrismaRedeemBatch: {
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  mockTxRedeemCode: { updateMany: vi.fn() },
  mockTxRedeemRecord: { create: vi.fn(), count: vi.fn() },
  mockTxRedeemBatch: { update: vi.fn(), updateMany: vi.fn() },
  mockCreditMantou: vi.fn(),
  mockCreditLedgerWithAdmin: vi.fn(),
  mockGetCouponByCode: vi.fn(),
  mockGetCouponById: vi.fn(),
  mockGetMemberByAddress: vi.fn(),
  mockGetMembershipTierById: vi.fn(),
  mockListActiveMembershipTiers: vi.fn(),
  mockUpdateMember: vi.fn(),
  mockAddMember: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/db", () => ({
  prisma: {
    redeemCode: mockPrismaRedeemCode,
    redeemRecord: mockPrismaRedeemRecord,
    redeemBatch: mockPrismaRedeemBatch,
    $transaction: vi.fn((fn: (tx: unknown) => unknown) =>
      fn({
        redeemCode: mockTxRedeemCode,
        redeemRecord: mockTxRedeemRecord,
        redeemBatch: mockTxRedeemBatch,
      })
    ),
  },
}));

vi.mock("@/lib/admin/admin-store", () => ({
  creditMantou: (...args: unknown[]) => mockCreditMantou(...args),
  getCouponByCode: (...args: unknown[]) => mockGetCouponByCode(...args),
  getCouponById: (...args: unknown[]) => mockGetCouponById(...args),
  getMemberByAddress: (...args: unknown[]) => mockGetMemberByAddress(...args),
  getMembershipTierById: (...args: unknown[]) => mockGetMembershipTierById(...args),
  listActiveMembershipTiers: (...args: unknown[]) => mockListActiveMembershipTiers(...args),
  updateMember: (...args: unknown[]) => mockUpdateMember(...args),
  addMember: (...args: unknown[]) => mockAddMember(...args),
}));

vi.mock("@/lib/ledger/ledger-credit", () => ({
  creditLedgerWithAdmin: (...args: unknown[]) => mockCreditLedgerWithAdmin(...args),
}));

vi.mock("@/lib/admin/redeem-store", () => ({
  normalizeRedeemCode: (raw: string) =>
    raw
      .replace(/[\s-]+/g, "")
      .trim()
      .toUpperCase(),
}));

vi.mock("@mysten/sui/utils", () => ({
  normalizeSuiAddress: (addr: string) => {
    if (!addr) return "";
    if (addr.startsWith("0x") && addr.length === 66) return addr.toLowerCase();
    if (/^[0-9a-fA-F]{64}$/.test(addr)) return "0x" + addr.toLowerCase();
    return addr;
  },
  isValidSuiAddress: (addr: string) => typeof addr === "string" && /^0x[0-9a-f]{64}$/.test(addr),
}));

vi.mock("@prisma/client", () => ({
  Prisma: {
    DbNull: "DbNull",
    InputJsonValue: {},
  },
}));

import { redeemCodeForUser } from "../redeem-service";

beforeEach(() => {
  vi.clearAllMocks();
  mockTxRedeemCode.updateMany.mockResolvedValue({ count: 1 });
  mockTxRedeemRecord.create.mockResolvedValue({ id: "RDM-mock-1234" });
  mockTxRedeemRecord.count.mockResolvedValue(0);
  mockTxRedeemBatch.updateMany.mockResolvedValue({ count: 1 });
  mockTxRedeemBatch.update.mockResolvedValue({});
  mockPrismaRedeemRecord.update.mockResolvedValue({});
  mockPrismaRedeemCode.update.mockResolvedValue({});
  mockPrismaRedeemBatch.update.mockResolvedValue({});
});

const validAddress = "0x" + "aa".repeat(32);
const now = new Date();

function makeCodeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "CODE-1",
    code: "TESTCODE",
    status: "active",
    rewardType: "mantou",
    rewardPayload: { amount: 100 },
    maxRedeem: 10,
    maxRedeemPerUser: 1,
    usedCount: 0,
    startsAt: null,
    expiresAt: null,
    batchId: null,
    batch: null,
    createdAt: now,
    updatedAt: null,
    lastRedeemedAt: null,
    ...overrides,
  };
}

describe("redeemCodeForUser", () => {
  describe("input validation", () => {
    it("returns error for empty address", async () => {
      const result = await redeemCodeForUser({ code: "ABC", address: "" });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("invalid_address");
        expect(result.status).toBe(400);
      }
    });

    it("returns error for invalid address format", async () => {
      const result = await redeemCodeForUser({ code: "ABC", address: "not-an-address" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("invalid_address");
    });

    it("returns error for empty code", async () => {
      const result = await redeemCodeForUser({ code: "", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("code_required");
    });

    it("returns error for whitespace-only code", async () => {
      const result = await redeemCodeForUser({ code: "   ", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("code_required");
    });
  });

  describe("code lookup", () => {
    it("returns error when code not found", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(null);
      const result = await redeemCodeForUser({ code: "INVALID", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("invalid_code");
        expect(result.status).toBe(404);
      }
    });

    it("returns error when code is disabled", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(makeCodeRow({ status: "disabled" }));
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("code_disabled");
        expect(result.status).toBe(403);
      }
    });

    it("returns error when code is exhausted", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(makeCodeRow({ status: "exhausted" }));
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("code_exhausted");
        expect(result.status).toBe(409);
      }
    });
  });

  describe("batch validation", () => {
    it("returns error when batch is disabled", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ batchId: "BATCH-1", batch: { id: "BATCH-1", status: "disabled" } })
      );
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("batch_disabled");
        expect(result.status).toBe(403);
      }
    });

    it("returns error when batch is exhausted", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ batchId: "BATCH-1", batch: { id: "BATCH-1", status: "exhausted" } })
      );
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("batch_exhausted");
        expect(result.status).toBe(409);
      }
    });
  });

  describe("time window validation", () => {
    it("returns error when code has not started yet", async () => {
      const future = new Date(Date.now() + 86400000);
      mockPrismaRedeemCode.findUnique.mockResolvedValue(makeCodeRow({ startsAt: future }));
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("code_not_started");
    });

    it("returns error and marks code expired when past expiry", async () => {
      const past = new Date(Date.now() - 86400000);
      mockPrismaRedeemCode.findUnique.mockResolvedValue(makeCodeRow({ expiresAt: past }));
      mockPrismaRedeemCode.update.mockResolvedValue({});
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("code_expired");
        expect(result.status).toBe(410);
      }
      expect(mockPrismaRedeemCode.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "expired" }) })
      );
    });
  });

  describe("usage limits", () => {
    it("returns error when code is fully used up", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ usedCount: 10, maxRedeem: 10 })
      );
      mockPrismaRedeemCode.update.mockResolvedValue({});
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("code_used_up");
    });

    it("returns duplicated result for single-use code already redeemed by user", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(makeCodeRow({ maxRedeemPerUser: 1 }));
      mockPrismaRedeemRecord.findFirst.mockResolvedValue({ id: "RDM-existing", status: "success" });
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.duplicated).toBe(true);
        expect(result.recordId).toBe("RDM-existing");
      }
    });
  });

  describe("mantou reward", () => {
    it("successfully redeems mantou reward", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "mantou", rewardPayload: { amount: 50 } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockCreditMantou.mockResolvedValue({
        wallet: { balance: 50 },
        transaction: { id: "TX-1" },
        duplicated: false,
      });
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.reward.type).toBe("mantou");
        expect(result.reward.amount).toBe(50);
      }
      expect(mockCreditMantou).toHaveBeenCalledWith(expect.objectContaining({ amount: 50 }));
    });

    it("returns error when mantou amount is zero or negative", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "mantou", rewardPayload: { amount: 0 } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("reward_amount_required");
    });

    it("returns error when mantou amount is non-numeric", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "mantou", rewardPayload: { amount: "abc" } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("reward_amount_required");
    });
  });

  describe("diamond reward", () => {
    it("successfully redeems diamond reward", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "diamond", rewardPayload: { amount: 200 } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockCreditLedgerWithAdmin.mockResolvedValue({
        digest: "digest-123",
        effects: {},
        events: [],
        recordId: "RDM-mock-1234",
      });
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.reward.type).toBe("diamond");
        expect(result.reward.amount).toBe(200);
        expect(result.reward.digest).toBe("digest-123");
      }
    });
  });

  describe("vip reward", () => {
    it("creates new member when none exists", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "vip", rewardPayload: { days: 30 } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockGetMembershipTierById.mockResolvedValue(null);
      mockListActiveMembershipTiers.mockResolvedValue([{ id: "TIER-1", name: "Gold" }]);
      mockGetMemberByAddress.mockResolvedValue(null);
      mockAddMember.mockResolvedValue({});
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.reward.type).toBe("vip");
        expect(result.reward.days).toBe(30);
        expect(result.reward.tierName).toBe("Gold");
      }
      expect(mockAddMember).toHaveBeenCalled();
    });

    it("extends existing member expiry", async () => {
      const futureExpiry = Date.now() + 86400000 * 10;
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "vip", rewardPayload: { days: 30 } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockGetMembershipTierById.mockResolvedValue(null);
      mockListActiveMembershipTiers.mockResolvedValue([{ id: "TIER-1", name: "Gold" }]);
      mockGetMemberByAddress.mockResolvedValue({ id: "MBR-1", expiresAt: futureExpiry });
      mockUpdateMember.mockResolvedValue({});
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(true);
      expect(mockUpdateMember).toHaveBeenCalled();
    });

    it("returns error when no VIP tier exists", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "vip", rewardPayload: { days: 30 } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockGetMembershipTierById.mockResolvedValue(null);
      mockListActiveMembershipTiers.mockResolvedValue([]);
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("vip_tier_missing");
    });
  });

  describe("coupon reward", () => {
    it("successfully redeems coupon by couponId", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "coupon", rewardPayload: { couponId: "CPN-1" } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockGetCouponById.mockResolvedValue({
        id: "CPN-1",
        title: "10% Off",
        code: "SAVE10",
        status: "可用",
        discount: 10,
        minSpend: null,
        startsAt: null,
        expiresAt: null,
      });
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.reward.type).toBe("coupon");
        expect(result.reward.coupon?.title).toBe("10% Off");
      }
    });

    it("returns error when coupon not found", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "coupon", rewardPayload: { couponId: "CPN-MISSING" } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockGetCouponById.mockResolvedValue(null);
      mockGetCouponByCode.mockResolvedValue(null);
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("coupon_not_found");
    });

    it("returns error when coupon is unavailable", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "coupon", rewardPayload: { couponId: "CPN-1" } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockGetCouponById.mockResolvedValue({ id: "CPN-1", title: "X", status: "已过期" });
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("coupon_unavailable");
    });

    it("returns error when coupon has not started", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "coupon", rewardPayload: { couponId: "CPN-1" } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockGetCouponById.mockResolvedValue({
        id: "CPN-1",
        title: "X",
        status: "可用",
        startsAt: Date.now() + 86400000,
        expiresAt: null,
      });
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("coupon_not_started");
    });

    it("returns error when coupon is expired", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "coupon", rewardPayload: { couponId: "CPN-1" } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockGetCouponById.mockResolvedValue({
        id: "CPN-1",
        title: "X",
        status: "可用",
        startsAt: null,
        expiresAt: Date.now() - 86400000,
      });
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("coupon_expired");
    });
  });

  describe("custom reward", () => {
    it("successfully redeems custom reward", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "custom", rewardPayload: { message: "Special prize!" } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.reward.type).toBe("custom");
        expect(result.reward.message).toBe("Special prize!");
      }
    });

    it("uses default message when none provided", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "custom", rewardPayload: {} })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.reward.message).toBe("兑换成功");
    });
  });

  describe("reward failure rollback", () => {
    it("rolls back code usedCount on reward failure", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "mantou", rewardPayload: { amount: 100 } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockCreditMantou.mockRejectedValue(new Error("mantou_service_down"));
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.status).toBe(500);
      expect(mockPrismaRedeemRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) })
      );
      expect(mockPrismaRedeemCode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ usedCount: { decrement: 1 } }),
        })
      );
    });

    it("rolls back batch usedCount on reward failure when batchId exists", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({
          rewardType: "mantou",
          rewardPayload: { amount: 100 },
          batchId: "BATCH-1",
          batch: { id: "BATCH-1", status: "active", maxRedeem: 100, usedCount: 5 },
        })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockCreditMantou.mockRejectedValue(new Error("mantou_service_down"));
      mockPrismaRedeemBatch.update.mockResolvedValue({});
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      // Verify batch rollback was called
      expect(mockPrismaRedeemBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "BATCH-1" },
          data: expect.objectContaining({ usedCount: { decrement: 1 } }),
        })
      );
    });
  });

  describe("code exhaustion", () => {
    it("marks code as exhausted when last use", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({
          rewardType: "custom",
          rewardPayload: { message: "ok" },
          usedCount: 9,
          maxRedeem: 10,
        })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(true);
      expect(mockPrismaRedeemCode.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "exhausted" }) })
      );
    });

    it("marks batch as exhausted when batch maxRedeem reached", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({
          rewardType: "custom",
          rewardPayload: { message: "ok" },
          usedCount: 0,
          maxRedeem: 10,
          batchId: "BATCH-1",
          batch: { id: "BATCH-1", status: "active", maxRedeem: 5, usedCount: 4 },
        })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockPrismaRedeemBatch.update.mockResolvedValue({});
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(true);
      // Verify batch exhaustion update was called
      expect(mockPrismaRedeemBatch.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "BATCH-1" },
          data: expect.objectContaining({ status: "exhausted" }),
        })
      );
    });
  });

  describe("missing reward type", () => {
    it("returns error when rewardType is missing", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: null, batch: null })
      );
      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("reward_missing");
    });
  });

  describe("transaction-level validation", () => {
    it("returns error when user limit reached in transaction", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(makeCodeRow({ maxRedeemPerUser: 2 }));
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      // In the transaction, count returns >= maxPerUser
      mockTxRedeemRecord.count.mockResolvedValue(2);

      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("user_limit_reached");
    });

    it("returns error when batch_used_up in transaction", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({
          batchId: "BATCH-1",
          batch: { id: "BATCH-1", status: "active", maxRedeem: 5, usedCount: 5 },
        })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockTxRedeemRecord.count.mockResolvedValue(0);
      // Batch updateMany returns 0 (no rows updated = batch full)
      mockTxRedeemBatch.updateMany.mockResolvedValue({ count: 0 });

      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("batch_used_up");
    });

    it("increments batch without maxRedeem check", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({
          rewardType: "custom",
          rewardPayload: { message: "ok" },
          batchId: "BATCH-2",
          batch: { id: "BATCH-2", status: "active", maxRedeem: null, usedCount: 3 },
        })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockTxRedeemRecord.count.mockResolvedValue(0);
      mockTxRedeemBatch.update.mockResolvedValue({});

      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(true);
      expect(mockTxRedeemBatch.update).toHaveBeenCalled();
    });

    it("returns error when code_used_up in transaction", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(makeCodeRow({ maxRedeemPerUser: 5 }));
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockTxRedeemRecord.count.mockResolvedValue(0);
      // Code updateMany returns 0 (code fully used)
      mockTxRedeemCode.updateMany.mockResolvedValue({ count: 0 });

      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("code_used_up");
    });
  });

  describe("reward failure with expiry", () => {
    it("marks code as expired on rollback when past expiry", async () => {
      const pastExpiry = new Date(Date.now() - 1000);
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({
          rewardType: "mantou",
          rewardPayload: { amount: 100 },
          expiresAt: pastExpiry,
        })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockCreditMantou.mockRejectedValue(new Error("mantou_down"));

      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      expect(mockPrismaRedeemCode.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "expired" }),
        })
      );
    });
  });

  describe("coupon reward by code", () => {
    it("finds coupon by couponCode when couponId not provided", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "coupon", rewardPayload: { couponCode: "SAVE20" } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockGetCouponById.mockResolvedValue(null);
      mockGetCouponByCode.mockResolvedValue({
        id: "CPN-2",
        title: "20% Off",
        code: "SAVE20",
        status: "可用",
        discount: 20,
        minSpend: null,
        startsAt: null,
        expiresAt: null,
      });

      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.reward.type).toBe("coupon");
        expect(result.reward.coupon?.code).toBe("SAVE20");
      }
    });
  });

  describe("vip reward with specific tierId", () => {
    it("uses specified tierId when available", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "vip", rewardPayload: { days: 30, tierId: "TIER-GOLD" } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockGetMembershipTierById.mockResolvedValue({ id: "TIER-GOLD", name: "Gold" });
      mockGetMemberByAddress.mockResolvedValue(null);
      mockAddMember.mockResolvedValue({});

      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.reward.tierName).toBe("Gold");
      }
      expect(mockGetMembershipTierById).toHaveBeenCalledWith("TIER-GOLD");
    });
  });

  describe("batch time window from batch", () => {
    it("uses batch startsAt when code startsAt is null", async () => {
      const future = new Date(Date.now() + 86400000);
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({
          startsAt: null,
          batchId: "BATCH-1",
          batch: { id: "BATCH-1", status: "active", startsAt: future },
        })
      );

      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("code_not_started");
    });

    it("uses batch expiresAt when code expiresAt is null", async () => {
      const past = new Date(Date.now() - 86400000);
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({
          expiresAt: null,
          batchId: "BATCH-1",
          batch: { id: "BATCH-1", status: "active", expiresAt: past },
        })
      );
      mockPrismaRedeemCode.update.mockResolvedValue({});

      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("code_expired");
    });
  });

  describe("reward type from batch", () => {
    it("uses batch rewardType when code rewardType is null", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({
          rewardType: null,
          rewardPayload: null,
          batchId: "BATCH-1",
          batch: {
            id: "BATCH-1",
            status: "active",
            rewardType: "custom",
            rewardPayload: { message: "batch reward" },
          },
        })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);

      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.reward.type).toBe("custom");
        expect(result.reward.message).toBe("batch reward");
      }
    });
  });

  describe("invalid reward type", () => {
    it("returns error for unknown reward type", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "unknown_type", rewardPayload: {} })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);

      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("reward_type_invalid");
    });
  });

  describe("coupon reward missing both couponId and couponCode", () => {
    it("returns error when neither couponId nor couponCode provided", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "coupon", rewardPayload: {} })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);

      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toBe("reward_coupon_required");
    });
  });

  describe("vip reward with non-string tierId", () => {
    it("defaults tierId to empty string when tierId is not a string", async () => {
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "vip", rewardPayload: { days: 30, tierId: 123 } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockGetMembershipTierById.mockResolvedValue(null);
      mockListActiveMembershipTiers.mockResolvedValue([{ id: "TIER-1", name: "Gold" }]);
      mockGetMemberByAddress.mockResolvedValue(null);
      mockAddMember.mockResolvedValue({});

      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.reward.type).toBe("vip");
        expect(result.reward.days).toBe(30);
      }
      // tierId was not a string, so it defaults to "" (falsy), skipping getMembershipTierById
      // and falling through to listActiveMembershipTiers
      expect(mockListActiveMembershipTiers).toHaveBeenCalled();
    });
  });

  describe("vip reward with expired member", () => {
    it("uses current time as base when member expiresAt is in the past", async () => {
      const pastExpiry = Date.now() - 86400000;
      mockPrismaRedeemCode.findUnique.mockResolvedValue(
        makeCodeRow({ rewardType: "vip", rewardPayload: { days: 30 } })
      );
      mockPrismaRedeemRecord.findFirst.mockResolvedValue(null);
      mockGetMembershipTierById.mockResolvedValue(null);
      mockListActiveMembershipTiers.mockResolvedValue([{ id: "TIER-1", name: "Gold" }]);
      mockGetMemberByAddress.mockResolvedValue({ id: "MBR-1", expiresAt: pastExpiry });
      mockUpdateMember.mockResolvedValue({});

      const result = await redeemCodeForUser({ code: "TESTCODE", address: validAddress });
      expect(result.ok).toBe(true);
      expect(mockUpdateMember).toHaveBeenCalled();
    });
  });
});
