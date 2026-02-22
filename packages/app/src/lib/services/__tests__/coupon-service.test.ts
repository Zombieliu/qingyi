import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFindUnique = vi.fn();
const mockCreate = vi.fn();
const mockFindMany = vi.fn();
const mockCount = vi.fn();
const mockUpdate = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    adminCoupon: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
    userCoupon: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
      count: (...args: unknown[]) => mockCount(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

import {
  claimCoupon,
  getUserCoupons,
  useCoupon,
  getUsableCouponCount,
} from "@/lib/services/coupon-service";

const activeCoupon = {
  id: "C-1",
  title: "新人优惠",
  code: "NEW10",
  description: "满100减10",
  discount: 10,
  minSpend: 100,
  status: "上架",
  startsAt: null,
  expiresAt: new Date(Date.now() + 86400_000),
  createdAt: new Date(),
  updatedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("claimCoupon", () => {
  it("claims a valid coupon", async () => {
    // First call: adminCoupon.findUnique → coupon exists
    // Second call: userCoupon.findUnique → not claimed yet
    mockFindUnique
      .mockResolvedValueOnce(activeCoupon) // adminCoupon
      .mockResolvedValueOnce(null); // userCoupon (not claimed)
    mockCreate.mockResolvedValue({ id: "UC-1", couponId: "C-1", status: "unused" });

    const result = await claimCoupon("0xabc", "C-1");
    expect(result).toHaveProperty("ok", true);
    expect(mockCreate).toHaveBeenCalled();
  });

  it("rejects expired coupon", async () => {
    mockFindUnique.mockResolvedValueOnce({
      ...activeCoupon,
      expiresAt: new Date(Date.now() - 86400_000),
    });

    const result = await claimCoupon("0xabc", "C-1");
    expect(result).toHaveProperty("error", "coupon_expired");
  });

  it("rejects non-existent coupon", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    const result = await claimCoupon("0xabc", "C-999");
    expect(result).toHaveProperty("error", "coupon_not_found");
  });

  it("rejects duplicate claim", async () => {
    mockFindUnique.mockResolvedValueOnce(activeCoupon).mockResolvedValueOnce({ id: "UC-existing" }); // already claimed

    const result = await claimCoupon("0xabc", "C-1");
    expect(result).toHaveProperty("error", "already_claimed");
  });

  it("rejects coupon not yet started", async () => {
    mockFindUnique.mockResolvedValueOnce({
      ...activeCoupon,
      startsAt: new Date(Date.now() + 86400_000),
    });

    const result = await claimCoupon("0xabc", "C-1");
    expect(result).toHaveProperty("error", "coupon_not_started");
  });
});

describe("getUserCoupons", () => {
  it("returns user coupons", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "UC-1",
        couponId: "C-1",
        couponTitle: "新人优惠",
        discount: 10,
        minSpend: 100,
        status: "unused",
        expiresAt: new Date(),
        usedAt: null,
        usedOrderId: null,
        createdAt: new Date(),
      },
    ]);

    const result = await getUserCoupons("0xabc", "unused");
    expect(result).toHaveLength(1);
    expect(result[0].couponTitle).toBe("新人优惠");
  });
});

describe("useCoupon", () => {
  it("uses a valid coupon", async () => {
    mockFindUnique.mockResolvedValue({
      id: "UC-1",
      userAddress: "0xabc",
      status: "unused",
      discount: 10,
      expiresAt: new Date(Date.now() + 86400_000),
    });
    mockUpdate.mockResolvedValue({ id: "UC-1", status: "used", discount: 10 });

    const result = await useCoupon("UC-1", "0xabc", "ORD-1");
    expect(result).toHaveProperty("ok", true);
    expect(result).toHaveProperty("discount", 10);
  });

  it("rejects already used coupon", async () => {
    mockFindUnique.mockResolvedValue({
      id: "UC-1",
      userAddress: "0xabc",
      status: "used",
    });

    const result = await useCoupon("UC-1", "0xabc", "ORD-1");
    expect(result).toHaveProperty("error", "coupon_already_used");
  });

  it("rejects wrong user", async () => {
    mockFindUnique.mockResolvedValue({
      id: "UC-1",
      userAddress: "0xother",
      status: "unused",
    });

    const result = await useCoupon("UC-1", "0xabc", "ORD-1");
    expect(result).toHaveProperty("error", "coupon_not_found");
  });

  it("expires coupon if past expiry", async () => {
    mockFindUnique.mockResolvedValue({
      id: "UC-1",
      userAddress: "0xabc",
      status: "unused",
      expiresAt: new Date(Date.now() - 86400_000),
    });
    mockUpdate.mockResolvedValue({ id: "UC-1", status: "expired" });

    const result = await useCoupon("UC-1", "0xabc", "ORD-1");
    expect(result).toHaveProperty("error", "coupon_expired");
  });
});

describe("getUsableCouponCount", () => {
  it("returns count of usable coupons", async () => {
    mockCount.mockResolvedValue(3);
    const count = await getUsableCouponCount("0xabc");
    expect(count).toBe(3);
  });
});
