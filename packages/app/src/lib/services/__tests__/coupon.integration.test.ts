/**
 * Integration tests for UserCoupon — real Prisma + Postgres
 */
import { describe, it, expect } from "vitest";
import { setupIntegrationTests } from "@/test/integration-setup";
import { randomUUID } from "crypto";

const { getPrisma } = setupIntegrationTests();

describe("UserCoupon integration", () => {
  it("creates a coupon", async () => {
    const prisma = getPrisma();
    const coupon = await prisma.userCoupon.create({
      data: {
        id: randomUUID(),
        userAddress: "0xuser1",
        couponId: "COUPON-001",
        couponTitle: "新人优惠",
        discount: 50,
        minSpend: 100,
        status: "unused",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    expect(coupon.status).toBe("unused");
    expect(coupon.discount).toBe(50);
  });

  it("finds unused coupons for user", async () => {
    const prisma = getPrisma();
    const addr = "0xcoupon_user";
    const now = new Date();
    await Promise.all([
      prisma.userCoupon.create({
        data: {
          id: randomUUID(),
          userAddress: addr,
          couponId: "C1",
          couponTitle: "A",
          discount: 10,
          status: "unused",
          createdAt: now,
        },
      }),
      prisma.userCoupon.create({
        data: {
          id: randomUUID(),
          userAddress: addr,
          couponId: "C2",
          couponTitle: "B",
          discount: 20,
          status: "used",
          createdAt: now,
        },
      }),
      prisma.userCoupon.create({
        data: {
          id: randomUUID(),
          userAddress: addr,
          couponId: "C3",
          couponTitle: "C",
          discount: 30,
          status: "unused",
          createdAt: now,
        },
      }),
    ]);

    const unused = await prisma.userCoupon.findMany({
      where: { userAddress: addr, status: "unused" },
    });
    expect(unused).toHaveLength(2);
  });

  it("marks coupon as used", async () => {
    const prisma = getPrisma();
    const coupon = await prisma.userCoupon.create({
      data: {
        id: randomUUID(),
        userAddress: "0xuser",
        couponId: "C-USE",
        couponTitle: "测试券",
        discount: 25,
        minSpend: 50,
        status: "unused",
        createdAt: new Date(),
      },
    });

    const updated = await prisma.userCoupon.update({
      where: { id: coupon.id },
      data: { status: "used", usedAt: new Date(), usedOrderId: "ORD-123" },
    });
    expect(updated.status).toBe("used");
    expect(updated.usedAt).not.toBeNull();
  });

  it("enforces unique userAddress+couponId", async () => {
    const prisma = getPrisma();
    const data = {
      userAddress: "0xunique",
      couponId: "SAME",
      couponTitle: "test",
      status: "unused",
      createdAt: new Date(),
    };
    await prisma.userCoupon.create({ data: { id: randomUUID(), ...data } });
    await expect(
      prisma.userCoupon.create({ data: { id: randomUUID(), ...data } })
    ).rejects.toThrow();
  });
});
