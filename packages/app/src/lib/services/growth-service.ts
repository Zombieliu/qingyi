import { prisma } from "@/lib/db";

/**
 * 用户成长体系 — 基于现有 VIP 积分自动升级
 *
 * 积分规则：
 * - 完成订单：订单金额 × 1 (1元=1积分)
 * - 评价订单：+20
 * - 邀请好友（被邀请人首单）：+200
 * - 每日签到：+10
 *
 * VIP 会员加成：积分 × 1.5
 *
 * 自动升级：积分达到 tier.minPoints 自动升级到对应等级
 */

// ─── Points rules ───

export const POINTS_RULES = {
  /** 完成订单：1元 = 1积分 */
  ORDER_COMPLETE_RATE: 1,
  /** 评价订单 */
  REVIEW: 20,
  /** 邀请好友首单 */
  REFERRAL: 200,
  /** 每日签到 */
  DAILY_CHECKIN: 10,
  /** VIP 会员积分加成倍率 */
  VIP_MULTIPLIER: 1.5,
} as const;

// ─── Core functions ───

/**
 * 给用户加积分并检查是否需要升级
 * @returns 更新后的 member 信息，如果用户不存在则自动创建
 */
export async function addPointsAndUpgrade(params: {
  userAddress: string;
  points: number;
  reason: string;
  orderId?: string;
}) {
  const { userAddress, points, reason, orderId } = params;
  if (points <= 0 || !userAddress) return null;

  // 查找或创建 member
  let member = await prisma.adminMember.findFirst({ where: { userAddress } });

  if (!member) {
    // 自动创建 member 记录
    member = await prisma.adminMember.create({
      data: {
        id: `MBR-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        userAddress,
        points: 0,
        status: "active",
        createdAt: new Date(),
      },
    });
  }

  // 检查是否 VIP，应用加成
  const isVip =
    member.tierId &&
    member.status === "active" &&
    (!member.expiresAt || member.expiresAt > new Date());
  const multiplier = isVip ? POINTS_RULES.VIP_MULTIPLIER : 1;
  const actualPoints = Math.round(points * multiplier);
  const newTotal = (member.points || 0) + actualPoints;

  // 更新积分
  const updated = await prisma.adminMember.update({
    where: { id: member.id },
    data: {
      points: newTotal,
      updatedAt: new Date(),
    },
  });

  console.log("[growth]", "points.earned", {
    userAddress,
    points: actualPoints,
    basePoints: points,
    multiplier,
    reason,
    orderId,
    newTotal,
  });

  // 检查自动升级
  const upgraded = await checkAndUpgrade(updated.id, newTotal);

  return {
    memberId: updated.id,
    points: newTotal,
    earned: actualPoints,
    multiplier,
    upgraded,
  };
}

/**
 * 检查积分是否达到更高等级门槛，自动升级
 */
async function checkAndUpgrade(memberId: string, currentPoints: number) {
  // 获取所有上架的等级，按 level 降序（从高到低匹配）
  const tiers = await prisma.adminMembershipTier.findMany({
    where: { status: "上架" },
    orderBy: { level: "desc" },
  });

  if (tiers.length === 0) return null;

  // 找到用户能达到的最高等级
  const qualifiedTier = tiers.find((t) => t.minPoints !== null && currentPoints >= t.minPoints);

  if (!qualifiedTier) return null;

  // 获取当前 member
  const member = await prisma.adminMember.findUnique({ where: { id: memberId } });
  if (!member) return null;

  // 如果已经是这个等级或更高，不降级
  if (member.tierId) {
    const currentTier = tiers.find((t) => t.id === member.tierId);
    if (currentTier && currentTier.level >= qualifiedTier.level) return null;
  }

  // 升级
  await prisma.adminMember.update({
    where: { id: memberId },
    data: {
      tierId: qualifiedTier.id,
      tierName: qualifiedTier.name,
      updatedAt: new Date(),
    },
  });

  console.log("[growth]", "member.auto_upgraded", {
    memberId,
    newTierId: qualifiedTier.id,
    newTierName: qualifiedTier.name,
    newLevel: qualifiedTier.level,
    points: currentPoints,
    minPoints: qualifiedTier.minPoints,
  });

  // Notify user of level up (non-blocking)
  try {
    const { notifyLevelUp } = await import("@/lib/services/notification-service");
    if (member.userAddress) {
      await notifyLevelUp({
        userAddress: member.userAddress,
        tierName: qualifiedTier.name,
        level: qualifiedTier.level,
      });
    }
  } catch {
    // non-critical
  }

  return {
    tierId: qualifiedTier.id,
    tierName: qualifiedTier.name,
    level: qualifiedTier.level,
  };
}

/**
 * 订单完成时调用 — 按金额加积分
 */
export async function onOrderCompleted(params: {
  userAddress: string;
  amount: number;
  orderId: string;
}) {
  const points = Math.round(params.amount * POINTS_RULES.ORDER_COMPLETE_RATE);
  return addPointsAndUpgrade({
    userAddress: params.userAddress,
    points,
    reason: "order_complete",
    orderId: params.orderId,
  });
}

/**
 * 用户评价时调用
 */
export async function onReviewSubmitted(params: { userAddress: string; orderId: string }) {
  return addPointsAndUpgrade({
    userAddress: params.userAddress,
    points: POINTS_RULES.REVIEW,
    reason: "review",
    orderId: params.orderId,
  });
}

/**
 * 邀请好友首单时调用
 */
export async function onReferralFirstOrder(params: {
  referrerAddress: string;
  refereeAddress: string;
  orderId: string;
}) {
  return addPointsAndUpgrade({
    userAddress: params.referrerAddress,
    points: POINTS_RULES.REFERRAL,
    reason: "referral",
    orderId: params.orderId,
  });
}

/**
 * 每日签到
 */
export async function onDailyCheckin(userAddress: string) {
  // Dedup: check if already checked in today
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const existing = await prisma.growthEvent.findFirst({
    where: {
      userAddress,
      event: "daily_checkin",
      createdAt: { gte: todayStart },
    },
  });
  if (existing) {
    return { points: 0, earned: 0, multiplier: 1, upgraded: null, alreadyCheckedIn: true };
  }

  // Record checkin event
  await prisma.growthEvent.create({
    data: {
      id: `GE-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      event: "daily_checkin",
      userAddress,
      createdAt: new Date(),
    },
  });

  return addPointsAndUpgrade({
    userAddress,
    points: POINTS_RULES.DAILY_CHECKIN,
    reason: "daily_checkin",
  });
}

/**
 * 获取用户等级进度信息
 */
export async function getUserLevelProgress(userAddress: string) {
  const member = await prisma.adminMember.findFirst({ where: { userAddress } });
  const tiers = await prisma.adminMembershipTier.findMany({
    where: { status: "上架" },
    orderBy: { level: "asc" },
  });

  const points = member?.points || 0;
  const currentTier = member?.tierId ? tiers.find((t) => t.id === member.tierId) || null : null;

  // 找下一个等级
  const nextTier = tiers.find((t) => t.minPoints !== null && t.minPoints > points) || null;

  // 计算进度
  const currentMin = currentTier?.minPoints || 0;
  const nextMin = nextTier?.minPoints || (currentTier ? currentMin * 2 : 100);
  const progress =
    nextMin > currentMin
      ? Math.min(100, Math.round(((points - currentMin) / (nextMin - currentMin)) * 100))
      : 100;

  return {
    points,
    currentTier: currentTier
      ? {
          id: currentTier.id,
          name: currentTier.name,
          level: currentTier.level,
          badge: currentTier.badge,
        }
      : null,
    nextTier: nextTier
      ? {
          id: nextTier.id,
          name: nextTier.name,
          level: nextTier.level,
          minPoints: nextTier.minPoints,
        }
      : null,
    pointsToNext: nextTier?.minPoints ? Math.max(0, nextTier.minPoints - points) : 0,
    progress,
    isVip: Boolean(currentTier),
    allTiers: tiers.map((t) => ({
      id: t.id,
      name: t.name,
      level: t.level,
      badge: t.badge,
      minPoints: t.minPoints,
      reached: t.minPoints !== null && points >= t.minPoints,
    })),
  };
}
