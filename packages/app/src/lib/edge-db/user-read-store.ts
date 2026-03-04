import "server-only";

import type {
  AdminCoupon,
  AdminMember,
  AdminMembershipTier,
  AdminPlayer,
  Referral,
} from "@/lib/admin/admin-types";
import { fetchEdgeRows, toEpochMs, toNumber } from "@/lib/edge-db/client";

type CouponRow = {
  id: string;
  title: string;
  code: string | null;
  description: string | null;
  discount: string | number | null;
  minSpend: string | number | null;
  status: string;
  startsAt: string | number | null;
  expiresAt: string | number | null;
  createdAt: string | number;
  updatedAt: string | number | null;
};

type PlayerRow = {
  id: string;
  name: string;
  role: string | null;
  status: string;
  depositBase: string | number | null;
  depositLocked: string | number | null;
};

type ReferralRow = {
  id: string;
  inviterAddress: string;
  inviteeAddress: string;
  status: string;
  rewardInviter: number | null;
  rewardInvitee: number | null;
  triggerOrderId: string | null;
  createdAt: string | number;
  rewardedAt: string | number | null;
};

type MemberRow = {
  id: string;
  userAddress: string | null;
  userName: string | null;
  tierId: string | null;
  tierName: string | null;
  points: number | null;
  status: string;
  expiresAt: string | number | null;
  note: string | null;
  createdAt: string | number;
  updatedAt: string | number | null;
};

type MembershipTierRow = {
  id: string;
  name: string;
  level: string | number;
  badge: string | null;
  price: string | number | null;
  durationDays: number | null;
  minPoints: number | null;
  status: string;
  perks: unknown;
  createdAt: string | number;
  updatedAt: string | number | null;
};

type SupportTicketRow = {
  id: string;
  topic: string | null;
  message: string;
  contact: string | null;
  status: string;
  reply: string | null;
  createdAt: string | number;
};

type PublicSupportTicket = {
  id: string;
  topic: string | null;
  message: string;
  contact: string | null;
  status: string;
  reply: string | null;
  createdAt: number;
};

function mapCoupon(row: CouponRow): AdminCoupon {
  return {
    id: row.id,
    title: row.title,
    code: row.code || undefined,
    description: row.description || undefined,
    discount: row.discount != null ? toNumber(row.discount) : undefined,
    minSpend: row.minSpend != null ? toNumber(row.minSpend) : undefined,
    status: row.status as AdminCoupon["status"],
    startsAt: toEpochMs(row.startsAt),
    expiresAt: toEpochMs(row.expiresAt),
    createdAt: toEpochMs(row.createdAt) ?? 0,
    updatedAt: toEpochMs(row.updatedAt),
  };
}

function mapPlayer(
  row: PlayerRow
): Pick<AdminPlayer, "id" | "name" | "role" | "status" | "depositBase" | "depositLocked"> {
  return {
    id: row.id,
    name: row.name,
    role: row.role || undefined,
    status: row.status as AdminPlayer["status"],
    depositBase: row.depositBase != null ? toNumber(row.depositBase) : undefined,
    depositLocked: row.depositLocked != null ? toNumber(row.depositLocked) : undefined,
  };
}

function mapReferral(row: ReferralRow): Referral {
  return {
    id: row.id,
    inviterAddress: row.inviterAddress,
    inviteeAddress: row.inviteeAddress,
    status: row.status as Referral["status"],
    rewardInviter: row.rewardInviter ?? undefined,
    rewardInvitee: row.rewardInvitee ?? undefined,
    triggerOrderId: row.triggerOrderId ?? undefined,
    createdAt: toEpochMs(row.createdAt) ?? 0,
    rewardedAt: toEpochMs(row.rewardedAt),
  };
}

function mapMember(row: MemberRow): AdminMember {
  return {
    id: row.id,
    userAddress: row.userAddress || undefined,
    userName: row.userName || undefined,
    tierId: row.tierId || undefined,
    tierName: row.tierName || undefined,
    points: row.points ?? undefined,
    status: row.status as AdminMember["status"],
    expiresAt: toEpochMs(row.expiresAt),
    note: row.note || undefined,
    createdAt: toEpochMs(row.createdAt) ?? 0,
    updatedAt: toEpochMs(row.updatedAt),
  };
}

function mapMembershipTier(row: MembershipTierRow): AdminMembershipTier {
  return {
    id: row.id,
    name: row.name,
    level: toNumber(row.level),
    badge: row.badge || undefined,
    price: row.price != null ? toNumber(row.price) : undefined,
    durationDays: row.durationDays ?? undefined,
    minPoints: row.minPoints ?? undefined,
    status: row.status as AdminMembershipTier["status"],
    perks: (row.perks as AdminMembershipTier["perks"]) || undefined,
    createdAt: toEpochMs(row.createdAt) ?? 0,
    updatedAt: toEpochMs(row.updatedAt),
  };
}

export async function listActiveCouponsEdgeRead(nowMs = Date.now()): Promise<AdminCoupon[]> {
  const params = new URLSearchParams({
    select:
      "id,title,code,description,discount,minSpend,status,startsAt,expiresAt,createdAt,updatedAt",
    status: "eq.可用",
    deletedAt: "is.null",
    order: "createdAt.desc",
    limit: "200",
  });
  const rows = await fetchEdgeRows<CouponRow>("AdminCoupon", params);
  return rows.map(mapCoupon).filter((coupon) => {
    const startsAt = coupon.startsAt;
    const expiresAt = coupon.expiresAt;
    return (startsAt == null || startsAt <= nowMs) && (expiresAt == null || expiresAt >= nowMs);
  });
}

export async function listPlayersPublicEdgeRead(): Promise<
  Array<Pick<AdminPlayer, "id" | "name" | "role" | "status" | "depositBase" | "depositLocked">>
> {
  const params = new URLSearchParams({
    select: "id,name,role,status,depositBase,depositLocked",
    deletedAt: "is.null",
    order: "createdAt.desc",
  });
  const rows = await fetchEdgeRows<PlayerRow>("AdminPlayer", params);
  return rows.map(mapPlayer);
}

export async function getReferralByInviteeEdgeRead(
  inviteeAddress: string
): Promise<Referral | null> {
  const params = new URLSearchParams({
    select:
      "id,inviterAddress,inviteeAddress,status,rewardInviter,rewardInvitee,triggerOrderId,createdAt,rewardedAt",
    inviteeAddress: `eq.${inviteeAddress}`,
    limit: "1",
  });
  const rows = await fetchEdgeRows<ReferralRow>("Referral", params);
  return rows.length > 0 ? mapReferral(rows[0]) : null;
}

export async function queryReferralsByInviterEdgeRead(inviterAddress: string): Promise<Referral[]> {
  const params = new URLSearchParams({
    select:
      "id,inviterAddress,inviteeAddress,status,rewardInviter,rewardInvitee,triggerOrderId,createdAt,rewardedAt",
    inviterAddress: `eq.${inviterAddress}`,
    order: "createdAt.desc",
    limit: "500",
  });
  const rows = await fetchEdgeRows<ReferralRow>("Referral", params);
  return rows.map(mapReferral);
}

export async function getMemberByAddressEdgeRead(userAddress: string): Promise<AdminMember | null> {
  if (process.env.NEXT_PUBLIC_VISUAL_TEST === "1" || process.env.VISUAL_TEST === "1") {
    return null;
  }

  const params = new URLSearchParams({
    select:
      "id,userAddress,userName,tierId,tierName,points,status,expiresAt,note,createdAt,updatedAt",
    userAddress: `eq.${userAddress}`,
    limit: "1",
  });
  const rows = await fetchEdgeRows<MemberRow>("AdminMember", params);
  return rows.length > 0 ? mapMember(rows[0]) : null;
}

export async function getMembershipTierByIdEdgeRead(
  tierId: string
): Promise<AdminMembershipTier | null> {
  const params = new URLSearchParams({
    select: "id,name,level,badge,price,durationDays,minPoints,status,perks,createdAt,updatedAt",
    id: `eq.${tierId}`,
    limit: "1",
  });
  const rows = await fetchEdgeRows<MembershipTierRow>("AdminMembershipTier", params);
  return rows.length > 0 ? mapMembershipTier(rows[0]) : null;
}

export async function listSupportTicketsByAddressEdgeRead(
  address: string
): Promise<PublicSupportTicket[]> {
  const params = new URLSearchParams({
    select: "id,topic,message,contact,status,reply,createdAt",
    userAddress: `eq.${address}`,
    order: "createdAt.desc",
    limit: "20",
  });
  const rows = await fetchEdgeRows<SupportTicketRow>("AdminSupportTicket", params);
  return rows.map((row) => ({
    id: row.id,
    topic: row.topic,
    message: row.message,
    contact: row.contact,
    status: row.status,
    reply: row.reply,
    createdAt: toEpochMs(row.createdAt) ?? 0,
  }));
}
