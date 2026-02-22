import { prisma } from "@/lib/db";

/**
 * 优惠券服务 — 领取、使用、查询
 */

/**
 * 用户领取优惠券
 */
export async function claimCoupon(userAddress: string, couponId: string) {
  // Check coupon exists and is active
  const coupon = await prisma.adminCoupon.findUnique({ where: { id: couponId } });
  if (!coupon || coupon.status !== "上架") {
    return { error: "coupon_not_found" };
  }

  // Check expiry
  if (coupon.expiresAt && coupon.expiresAt < new Date()) {
    return { error: "coupon_expired" };
  }

  // Check not started
  if (coupon.startsAt && coupon.startsAt > new Date()) {
    return { error: "coupon_not_started" };
  }

  // Check duplicate claim
  const existing = await prisma.userCoupon.findUnique({
    where: { userAddress_couponId: { userAddress, couponId } },
  });
  if (existing) {
    return { error: "already_claimed" };
  }

  const userCoupon = await prisma.userCoupon.create({
    data: {
      id: `UC-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      userAddress,
      couponId,
      couponTitle: coupon.title,
      discount: coupon.discount,
      minSpend: coupon.minSpend,
      status: "unused",
      expiresAt: coupon.expiresAt,
      createdAt: new Date(),
    },
  });

  return { ok: true, userCoupon };
}

/**
 * 获取用户的优惠券列表
 */
export async function getUserCoupons(userAddress: string, status?: string) {
  const where: Record<string, unknown> = { userAddress };
  if (status && status !== "all") {
    where.status = status;
  }

  const coupons = await prisma.userCoupon.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return coupons.map((c) => ({
    id: c.id,
    couponId: c.couponId,
    couponTitle: c.couponTitle,
    discount: c.discount,
    minSpend: c.minSpend,
    status: c.status,
    expiresAt: c.expiresAt?.getTime() || null,
    usedAt: c.usedAt?.getTime() || null,
    usedOrderId: c.usedOrderId,
    createdAt: c.createdAt.getTime(),
  }));
}

/**
 * 使用优惠券（下单时调用）
 */
export async function useCoupon(userCouponId: string, userAddress: string, orderId: string) {
  const uc = await prisma.userCoupon.findUnique({ where: { id: userCouponId } });
  if (!uc || uc.userAddress !== userAddress) {
    return { error: "coupon_not_found" };
  }
  if (uc.status !== "unused") {
    return { error: "coupon_already_used" };
  }
  if (uc.expiresAt && uc.expiresAt < new Date()) {
    await prisma.userCoupon.update({
      where: { id: userCouponId },
      data: { status: "expired" },
    });
    return { error: "coupon_expired" };
  }

  const updated = await prisma.userCoupon.update({
    where: { id: userCouponId },
    data: {
      status: "used",
      usedOrderId: orderId,
      usedAt: new Date(),
    },
  });

  return { ok: true, discount: updated.discount || 0 };
}

/**
 * 获取用户可用优惠券数量
 */
export async function getUsableCouponCount(userAddress: string) {
  return prisma.userCoupon.count({
    where: {
      userAddress,
      status: "unused",
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
  });
}
