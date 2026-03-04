import { logBusinessEvent } from "@/lib/business-events";
import {
  fetchEdgeRows,
  getEdgeDbConfig,
  insertEdgeRow,
  patchEdgeRowsByFilter,
  toEpochMs,
} from "@/lib/edge-db/client";
import { getMemberByAddressEdgeRead } from "@/lib/edge-db/user-read-store";
import { listActiveMembershipTiersEdgeRead } from "@/lib/edge-db/public-read-store";
import { randomInt } from "@/lib/shared/runtime-crypto";
import type { TransactionClient } from "@/lib/admin/admin-store-utils";

export const POINTS_RULES = {
  ORDER_COMPLETE_RATE: 1,
  REVIEW: 20,
  REFERRAL: 200,
  DAILY_CHECKIN: 10,
  VIP_MULTIPLIER: 1.5,
} as const;

type LegacyGrowthService = typeof import("./growth-service-legacy");

type AdminMemberRow = {
  id: string;
  userAddress: string | null;
  points: string | number | null;
  tierId: string | null;
  tierName: string | null;
  status: string;
  expiresAt: string | number | null;
};

let legacyServicePromise: Promise<LegacyGrowthService> | null = null;

async function loadLegacyService(): Promise<LegacyGrowthService> {
  const modulePath = "./growth-service-legacy";
  legacyServicePromise ??= import(modulePath).then((mod) => mod as unknown as LegacyGrowthService);
  return legacyServicePromise;
}

function hasEdgeReadConfig() {
  return Boolean(getEdgeDbConfig("read"));
}

function hasEdgeWriteConfig() {
  return Boolean(getEdgeDbConfig("write"));
}

function asNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

async function getOrCreateMemberForEdge(userAddress: string) {
  const existing = await fetchEdgeRows<AdminMemberRow>(
    "AdminMember",
    new URLSearchParams({
      select: "id,userAddress,points,tierId,tierName,status,expiresAt",
      userAddress: `eq.${userAddress}`,
      limit: "1",
    })
  );
  if (existing[0]) return existing[0];

  const id = `MBR-${Date.now()}-${randomInt(1000, 9999)}`;
  const nowIso = new Date().toISOString();
  await insertEdgeRow("AdminMember", {
    id,
    userAddress,
    points: 0,
    status: "active",
    createdAt: nowIso,
    updatedAt: nowIso,
  });
  return {
    id,
    userAddress,
    points: 0,
    tierId: null,
    tierName: null,
    status: "active",
    expiresAt: null,
  } satisfies AdminMemberRow;
}

async function maybeUpgradeMemberEdge(args: {
  memberId: string;
  userAddress: string;
  points: number;
}) {
  const tiers = await listActiveMembershipTiersEdgeRead();
  if (tiers.length === 0) return null;

  const sorted = [...tiers]
    .filter((tier) => tier.minPoints !== null && tier.minPoints !== undefined)
    .sort((a, b) => b.level - a.level);
  const qualified = sorted.find((tier) => args.points >= Number(tier.minPoints));
  if (!qualified) return null;

  const memberRows = await fetchEdgeRows<AdminMemberRow>(
    "AdminMember",
    new URLSearchParams({
      select: "id,tierId,userAddress",
      id: `eq.${args.memberId}`,
      limit: "1",
    })
  );
  const member = memberRows[0];
  if (!member) return null;
  if (member.tierId === qualified.id) return null;

  await patchEdgeRowsByFilter<AdminMemberRow>(
    "AdminMember",
    new URLSearchParams({ select: "id", id: `eq.${args.memberId}` }),
    {
      tierId: qualified.id,
      tierName: qualified.name,
      updatedAt: new Date().toISOString(),
    }
  );

  if (member.userAddress) {
    try {
      const { notifyLevelUp } = await import("@/lib/services/notification-service");
      await notifyLevelUp({
        userAddress: member.userAddress,
        tierName: qualified.name,
        level: qualified.level,
      });
    } catch {
      // non-critical
    }
  }

  return {
    tierId: qualified.id,
    tierName: qualified.name,
    level: qualified.level,
  };
}

export async function addPointsAndUpgrade(params: {
  userAddress: string;
  points: number;
  reason: string;
  orderId?: string;
  tx?: TransactionClient;
}) {
  if (!params.userAddress || params.points <= 0 || !hasEdgeReadConfig() || !hasEdgeWriteConfig()) {
    const legacy = await loadLegacyService();
    return legacy.addPointsAndUpgrade(params);
  }

  const member = await getOrCreateMemberForEdge(params.userAddress);
  const isVip =
    member.tierId &&
    member.status === "active" &&
    (!member.expiresAt || (toEpochMs(member.expiresAt) ?? 0) > Date.now());
  const multiplier = isVip ? POINTS_RULES.VIP_MULTIPLIER : 1;
  const earned = Math.round(params.points * multiplier);
  const newTotal = asNumber(member.points) + earned;

  await patchEdgeRowsByFilter<AdminMemberRow>(
    "AdminMember",
    new URLSearchParams({ select: "id", id: `eq.${member.id}` }),
    {
      points: newTotal,
      updatedAt: new Date().toISOString(),
    }
  );

  const upgraded = await maybeUpgradeMemberEdge({
    memberId: member.id,
    userAddress: params.userAddress,
    points: newTotal,
  });

  logBusinessEvent("growth.points_earned", {
    userAddress: params.userAddress,
    points: earned,
    basePoints: params.points,
    multiplier,
    reason: params.reason,
    orderId: params.orderId,
    newTotal,
  });

  return {
    memberId: member.id,
    points: newTotal,
    earned,
    multiplier,
    upgraded,
  };
}

export async function onOrderCompleted(params: {
  userAddress: string;
  amount: number;
  orderId: string;
  tx?: TransactionClient;
}) {
  const points = Math.round(params.amount * POINTS_RULES.ORDER_COMPLETE_RATE);
  return addPointsAndUpgrade({
    userAddress: params.userAddress,
    points,
    reason: "order_complete",
    orderId: params.orderId,
    tx: params.tx,
  });
}

export async function onReviewSubmitted(params: {
  userAddress: string;
  orderId: string;
  tx?: TransactionClient;
}) {
  return addPointsAndUpgrade({
    userAddress: params.userAddress,
    points: POINTS_RULES.REVIEW,
    reason: "review",
    orderId: params.orderId,
    tx: params.tx,
  });
}

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

export async function onDailyCheckin(userAddress: string) {
  if (!hasEdgeReadConfig() || !hasEdgeWriteConfig()) {
    const legacy = await loadLegacyService();
    return legacy.onDailyCheckin(userAddress);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const existingRows = await fetchEdgeRows<{ id: string }>(
    "GrowthEvent",
    new URLSearchParams({
      select: "id",
      userAddress: `eq.${userAddress}`,
      event: "eq.daily_checkin",
      createdAt: `gte.${today.toISOString()}`,
      limit: "1",
    })
  );
  if (existingRows[0]) {
    return { points: 0, earned: 0, multiplier: 1, upgraded: null, alreadyCheckedIn: true };
  }

  await insertEdgeRow("GrowthEvent", {
    id: `GE-${Date.now()}-${randomInt(1000, 9999)}`,
    event: "daily_checkin",
    userAddress,
    createdAt: new Date().toISOString(),
  });

  return addPointsAndUpgrade({
    userAddress,
    points: POINTS_RULES.DAILY_CHECKIN,
    reason: "daily_checkin",
  });
}

export async function getUserLevelProgress(userAddress: string) {
  if (!hasEdgeReadConfig()) {
    const legacy = await loadLegacyService();
    return legacy.getUserLevelProgress(userAddress);
  }

  const [member, tiers] = await Promise.all([
    getMemberByAddressEdgeRead(userAddress),
    listActiveMembershipTiersEdgeRead(),
  ]);

  const sorted = [...tiers].sort((a, b) => a.level - b.level);
  const points = member?.points || 0;
  const currentTier = member?.tierId
    ? sorted.find((tier) => tier.id === member.tierId) || null
    : null;
  const nextTier =
    sorted.find((tier) => tier.minPoints !== null && points < Number(tier.minPoints)) || null;

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
    pointsToNext: nextTier?.minPoints ? Math.max(0, Number(nextTier.minPoints) - points) : 0,
    progress,
    isVip: Boolean(currentTier),
    allTiers: sorted.map((tier) => ({
      id: tier.id,
      name: tier.name,
      level: tier.level,
      badge: tier.badge,
      minPoints: tier.minPoints,
      reached: tier.minPoints !== null && points >= Number(tier.minPoints),
    })),
  };
}
