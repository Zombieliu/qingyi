import type {
  Referral,
  ReferralConfig,
  LeaderboardEntry,
  LeaderboardType,
  LeaderboardPeriod,
} from "./admin-types";
import { prisma, Prisma } from "./admin-store-utils";
import { creditMantou } from "./mantou-store";
import { getCache, setCache } from "../server-cache";
import { TZDate } from "@date-fns/tz";
import { startOfWeek, startOfMonth } from "date-fns";

function mapReferral(row: {
  id: string;
  inviterAddress: string;
  inviteeAddress: string;
  status: string;
  rewardInviter: number | null;
  rewardInvitee: number | null;
  triggerOrderId: string | null;
  createdAt: Date;
  rewardedAt: Date | null;
}): Referral {
  return {
    id: row.id,
    inviterAddress: row.inviterAddress,
    inviteeAddress: row.inviteeAddress,
    status: row.status as Referral["status"],
    rewardInviter: row.rewardInviter ?? undefined,
    rewardInvitee: row.rewardInvitee ?? undefined,
    triggerOrderId: row.triggerOrderId ?? undefined,
    createdAt: row.createdAt.getTime(),
    rewardedAt: row.rewardedAt?.getTime(),
  };
}

function mapReferralConfig(row: {
  id: string;
  mode: string;
  fixedInviter: number;
  fixedInvitee: number;
  percentInviter: number;
  percentInvitee: number;
  enabled: boolean;
  updatedAt: Date | null;
}): ReferralConfig {
  return {
    id: row.id,
    mode: row.mode as ReferralConfig["mode"],
    fixedInviter: row.fixedInviter,
    fixedInvitee: row.fixedInvitee,
    percentInviter: row.percentInviter,
    percentInvitee: row.percentInvitee,
    enabled: row.enabled,
    updatedAt: row.updatedAt?.getTime(),
  };
}

export async function bindReferral(inviterAddress: string, inviteeAddress: string) {
  if (inviterAddress === inviteeAddress) throw new Error("cannot_self_refer");
  const existing = await prisma.referral.findUnique({ where: { inviteeAddress } });
  if (existing) return { referral: mapReferral(existing), duplicated: true };
  const row = await prisma.referral.create({
    data: {
      id: `REF-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      inviterAddress,
      inviteeAddress,
      status: "pending",
      createdAt: new Date(),
    },
  });
  return { referral: mapReferral(row), duplicated: false };
}

export async function getReferralByInvitee(inviteeAddress: string) {
  const row = await prisma.referral.findUnique({ where: { inviteeAddress } });
  return row ? mapReferral(row) : null;
}

export async function queryReferralsByInviter(inviterAddress: string) {
  const rows = await prisma.referral.findMany({
    where: { inviterAddress },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapReferral);
}

export async function getReferralConfig(): Promise<ReferralConfig> {
  const row = await prisma.referralConfig.findUnique({ where: { id: "default" } });
  if (!row) {
    return {
      id: "default",
      mode: "fixed",
      fixedInviter: 50,
      fixedInvitee: 30,
      percentInviter: 0.05,
      percentInvitee: 0.03,
      enabled: true,
    };
  }
  return mapReferralConfig(row);
}

export async function updateReferralConfig(patch: Partial<Omit<ReferralConfig, "id">>) {
  const row = await prisma.referralConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      mode: patch.mode ?? "fixed",
      fixedInviter: patch.fixedInviter ?? 50,
      fixedInvitee: patch.fixedInvitee ?? 30,
      percentInviter: patch.percentInviter ?? 0.05,
      percentInvitee: patch.percentInvitee ?? 0.03,
      enabled: patch.enabled ?? true,
      updatedAt: new Date(),
    },
    update: {
      mode: patch.mode,
      fixedInviter: patch.fixedInviter,
      fixedInvitee: patch.fixedInvitee,
      percentInviter: patch.percentInviter,
      percentInvitee: patch.percentInvitee,
      enabled: patch.enabled,
      updatedAt: new Date(),
    },
  });
  return mapReferralConfig(row);
}

export async function processReferralReward(
  orderId: string,
  userAddress: string,
  orderAmount: number
) {
  const referral = await prisma.referral.findUnique({ where: { inviteeAddress: userAddress } });
  if (!referral || referral.status !== "pending") return null;
  const config = await getReferralConfig();
  if (!config.enabled) return null;

  let inviterReward: number;
  let inviteeReward: number;
  if (config.mode === "percent") {
    inviterReward = Math.floor(orderAmount * config.percentInviter);
    inviteeReward = Math.floor(orderAmount * config.percentInvitee);
  } else {
    inviterReward = config.fixedInviter;
    inviteeReward = config.fixedInvitee;
  }
  if (inviterReward <= 0 && inviteeReward <= 0) return null;

  const now = new Date();
  await prisma.referral.update({
    where: { inviteeAddress: userAddress },
    data: {
      status: "rewarded",
      rewardInviter: inviterReward,
      rewardInvitee: inviteeReward,
      triggerOrderId: orderId,
      rewardedAt: now,
    },
  });

  const results: {
    inviter?: Awaited<ReturnType<typeof creditMantou>>;
    invitee?: Awaited<ReturnType<typeof creditMantou>>;
  } = {};
  if (inviterReward > 0) {
    results.inviter = await creditMantou({
      address: referral.inviterAddress,
      amount: inviterReward,
      note: `邀请返利：被邀请人首单完成 (${orderId})`,
    });
  }
  if (inviteeReward > 0) {
    results.invitee = await creditMantou({
      address: referral.inviteeAddress,
      amount: inviteeReward,
      note: `邀请奖励：首单完成奖励 (${orderId})`,
    });
  }
  return { inviterReward, inviteeReward, ...results };
}

export async function queryReferrals(params: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}) {
  const { page, pageSize, status, q } = params;
  const keyword = (q || "").trim();
  const where: Prisma.ReferralWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [
      { inviterAddress: { contains: keyword } },
      { inviteeAddress: { contains: keyword } },
      { triggerOrderId: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }
  const total = await prisma.referral.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.referral.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map(mapReferral),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

function getPeriodStart(period: LeaderboardPeriod): Date | null {
  if (period === "all") return null;
  const now = new TZDate(Date.now(), "Asia/Shanghai");

  if (period === "month") {
    return startOfMonth(now);
  }
  // week: Monday 00:00 Asia/Shanghai
  return startOfWeek(now, { weekStartsOn: 1 });
}

export async function getLeaderboard(
  type: LeaderboardType,
  period: LeaderboardPeriod,
  limit = 50
): Promise<LeaderboardEntry[]> {
  const cacheKey = `leaderboard:${type}:${period}`;
  const cached = getCache<LeaderboardEntry[]>(cacheKey);
  if (cached) return cached.value;

  const periodStart = getPeriodStart(period);
  let entries: LeaderboardEntry[];

  if (type === "spend") {
    const dateFilter = periodStart ? { createdAt: { gte: periodStart } } : {};
    const rows = await prisma.adminOrder.groupBy({
      by: ["userAddress"],
      where: { stage: "已完成", userAddress: { not: null }, ...dateFilter },
      _sum: { amount: true },
      orderBy: { _sum: { amount: "desc" } },
      take: limit,
    });
    entries = rows.map((row, i) => ({
      rank: i + 1,
      address: row.userAddress || "",
      value: Number(row._sum.amount ?? 0),
    }));
  } else if (type === "companion") {
    const dateFilter = periodStart ? { createdAt: { gte: periodStart } } : {};
    const rows = await prisma.adminOrder.groupBy({
      by: ["companionAddress"],
      where: { stage: "已完成", companionAddress: { not: null }, ...dateFilter },
      _count: { id: true },
      _sum: { amount: true },
      orderBy: { _count: { id: "desc" } },
      take: limit,
    });
    entries = rows.map((row, i) => ({
      rank: i + 1,
      address: row.companionAddress || "",
      value: row._count.id ?? 0,
      extra: Number(row._sum.amount ?? 0),
    }));
  } else {
    // referral
    const dateFilter = periodStart ? { rewardedAt: { gte: periodStart } } : {};
    const rows = await prisma.referral.groupBy({
      by: ["inviterAddress"],
      where: { status: "rewarded", ...dateFilter },
      _count: { id: true },
      orderBy: { _count: { id: "desc" } },
      take: limit,
    });
    entries = rows.map((row, i) => ({
      rank: i + 1,
      address: row.inviterAddress,
      value: row._count.id ?? 0,
    }));
  }

  setCache(cacheKey, entries, 60_000);
  return entries;
}
