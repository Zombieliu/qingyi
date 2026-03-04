import "server-only";

import type {
  AdminMember,
  AdminMembershipTier,
  AdminOrder,
  AdminPaymentEvent,
  AdminPlayer,
  AdminSupportTicket,
  Referral,
  ReferralConfig,
} from "@/lib/admin/admin-types";
import { mapPaymentStatus } from "@/lib/chain/chain-status";
import {
  fetchEdgeRows,
  insertEdgeRow,
  patchEdgeRowsByFilter,
  toNumber,
} from "@/lib/edge-db/client";
import { toEdgeDate, type EdgeDateValue } from "@/lib/edge-db/date-normalization";
import { scanEdgeTableRows } from "@/lib/edge-db/scan-utils";
import { DIAMOND_RATE } from "@/lib/shared/constants";

export type EdgeCursorPayload = { createdAt: number; id: string };

type AdminOrderRow = {
  id: string;
  user: string;
  userAddress: string | null;
  companionAddress: string | null;
  item: string;
  amount: string | number | null;
  currency: string;
  paymentStatus: string;
  stage: string;
  note: string | null;
  assignedTo: string | null;
  source: string | null;
  chainDigest: string | null;
  chainStatus: string | number | null;
  serviceFee: string | number | null;
  deposit: string | number | null;
  meta: unknown;
  createdAt: EdgeDateValue;
  updatedAt: EdgeDateValue;
  deletedAt: EdgeDateValue;
};

type AdminOrderLookupRow = {
  id: string;
  user: string;
  userAddress: string | null;
  companionAddress: string | null;
  item: string;
  amount: string | number | null;
  currency: string;
  paymentStatus: string;
  stage: string;
  note: string | null;
  assignedTo: string | null;
  source: string | null;
  chainDigest: string | null;
  chainStatus: string | number | null;
  serviceFee: string | number | null;
  deposit: string | number | null;
  meta: unknown;
  createdAt: EdgeDateValue;
  updatedAt: EdgeDateValue;
  deletedAt: EdgeDateValue;
};

type AdminOrderActiveExposureRow = {
  assignedTo: string | null;
  amount: string | number | null;
  stage: string;
};

type AdminPlayerRow = {
  id: string;
  name: string;
  role: string | null;
  contact: string | null;
  address: string | null;
  wechatQr: string | null;
  alipayQr: string | null;
  depositBase: string | number | null;
  depositLocked: string | number | null;
  creditMultiplier: number | null;
  status: string;
  notes: string | null;
  createdAt: EdgeDateValue;
  updatedAt: EdgeDateValue;
  deletedAt: EdgeDateValue;
};

type AdminSupportTicketRow = {
  id: string;
  userName: string | null;
  userAddress: string | null;
  contact: string | null;
  topic: string | null;
  message: string;
  status: string;
  note: string | null;
  reply: string | null;
  meta: unknown;
  createdAt: EdgeDateValue;
  updatedAt: EdgeDateValue;
  deletedAt: EdgeDateValue;
};

type ReferralRow = {
  id: string;
  inviterAddress: string;
  inviteeAddress: string;
  status: string;
  rewardInviter: string | number | null;
  rewardInvitee: string | number | null;
  triggerOrderId: string | null;
  createdAt: EdgeDateValue;
  rewardedAt: EdgeDateValue;
};

type ReferralConfigRow = {
  id: string;
  mode: string;
  fixedInviter: string | number;
  fixedInvitee: string | number;
  percentInviter: string | number;
  percentInvitee: string | number;
  enabled: boolean;
  updatedAt: EdgeDateValue;
};

type AdminMemberRow = {
  id: string;
  userAddress: string | null;
  userName: string | null;
  tierId: string | null;
  tierName: string | null;
  points: string | number | null;
  status: string;
  expiresAt: EdgeDateValue;
  note: string | null;
  createdAt: EdgeDateValue;
  updatedAt: EdgeDateValue;
};

type AdminMembershipTierRow = {
  id: string;
  name: string;
  level: number;
  badge: string | null;
  price: string | number | null;
  durationDays: number | null;
  minPoints: number | null;
  status: string;
  perks: unknown;
  createdAt: EdgeDateValue;
  updatedAt: EdgeDateValue;
};

type AdminPaymentEventRow = {
  id: string;
  provider: string;
  event: string;
  orderNo: string | null;
  amount: string | number | null;
  status: string | null;
  verified: boolean;
  createdAt: EdgeDateValue;
  raw: unknown;
};

type ChainOrderRow = {
  id: string;
  chainStatus: string | number | null;
  chainDigest: string | null;
  source: string | null;
  meta: unknown;
  createdAt: EdgeDateValue;
  deletedAt: EdgeDateValue;
};

type E2eOrderRow = {
  id: string;
  item: string | null;
  user: string | null;
  note: string | null;
};

const DEFAULT_REFERRAL_CONFIG: ReferralConfig = {
  id: "default",
  mode: "fixed",
  fixedInviter: 50,
  fixedInvitee: 30,
  percentInviter: 0.05,
  percentInvitee: 0.03,
  enabled: true,
};

function isNotDeleted(value: EdgeDateValue): boolean {
  return value === null || value === undefined;
}

function toOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function toOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toOptionalRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function toEpochMs(value: EdgeDateValue): number {
  return toEdgeDate(value).getTime();
}

function normalizeAddress(address: string): string {
  return address.trim().toLowerCase();
}

function compareByCreatedAtDesc<T extends { createdAt: number; id: string }>(a: T, b: T): number {
  if (a.createdAt !== b.createdAt) return b.createdAt - a.createdAt;
  return b.id.localeCompare(a.id);
}

function applyCursor<T extends { createdAt: number; id: string }>(
  rows: T[],
  cursor?: EdgeCursorPayload
): T[] {
  if (!cursor) return rows;
  return rows.filter(
    (row) =>
      row.createdAt < cursor.createdAt ||
      (row.createdAt === cursor.createdAt && row.id.localeCompare(cursor.id) < 0)
  );
}

function paginateByPage<T>(rows: T[], page: number, pageSize: number) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / safePageSize));
  const clampedPage = Math.min(Math.max(Math.floor(page), 1), totalPages);
  const start = (clampedPage - 1) * safePageSize;
  return {
    items: rows.slice(start, start + safePageSize),
    total,
    page: clampedPage,
    pageSize: safePageSize,
    totalPages,
  };
}

function paginateByCursor<T extends { createdAt: number; id: string }>(
  rows: T[],
  pageSize: number,
  cursor?: EdgeCursorPayload
) {
  const safePageSize = Math.max(1, Math.floor(pageSize));
  const filtered = applyCursor(rows, cursor);
  const chunk = filtered.slice(0, safePageSize + 1);
  const hasMore = chunk.length > safePageSize;
  const items = hasMore ? chunk.slice(0, safePageSize) : chunk;
  const last = items[items.length - 1];
  return {
    items,
    nextCursor: hasMore && last ? { id: last.id, createdAt: last.createdAt } : null,
  };
}

function mapOrderRow(row: AdminOrderRow | AdminOrderLookupRow): AdminOrder {
  const chainStatus = toOptionalNumber(row.chainStatus);
  const isChain = row.chainDigest !== null || chainStatus !== undefined;
  const paymentStatus = row.paymentStatus || "";
  const stage = row.stage || "待处理";
  const displayStatus =
    isChain && chainStatus !== undefined ? mapPaymentStatus(chainStatus) : paymentStatus || stage;

  return {
    id: row.id,
    user: row.user,
    userAddress: toOptionalString(row.userAddress),
    companionAddress: toOptionalString(row.companionAddress),
    item: row.item,
    amount: toNumber(row.amount),
    currency: row.currency,
    paymentStatus,
    stage: stage as AdminOrder["stage"],
    displayStatus,
    note: toOptionalString(row.note),
    assignedTo: toOptionalString(row.assignedTo),
    source: toOptionalString(row.source),
    chainDigest: toOptionalString(row.chainDigest),
    chainStatus,
    serviceFee: toOptionalNumber(row.serviceFee),
    deposit: toOptionalNumber(row.deposit),
    meta: toOptionalRecord(row.meta),
    createdAt: toEpochMs(row.createdAt),
    updatedAt: row.updatedAt == null ? undefined : toEpochMs(row.updatedAt),
  };
}

function mapPlayerRow(row: AdminPlayerRow): AdminPlayer {
  return {
    id: row.id,
    name: row.name,
    role: toOptionalString(row.role),
    contact: toOptionalString(row.contact),
    address: toOptionalString(row.address),
    wechatQr: toOptionalString(row.wechatQr),
    alipayQr: toOptionalString(row.alipayQr),
    depositBase: toOptionalNumber(row.depositBase),
    depositLocked: toOptionalNumber(row.depositLocked),
    creditMultiplier: toOptionalNumber(row.creditMultiplier),
    status: row.status as AdminPlayer["status"],
    notes: toOptionalString(row.notes),
    createdAt: toEpochMs(row.createdAt),
    updatedAt: row.updatedAt == null ? undefined : toEpochMs(row.updatedAt),
  };
}

function mapSupportTicketRow(row: AdminSupportTicketRow): AdminSupportTicket {
  return {
    id: row.id,
    userName: toOptionalString(row.userName),
    userAddress: toOptionalString(row.userAddress),
    contact: toOptionalString(row.contact),
    topic: toOptionalString(row.topic),
    message: row.message,
    status: row.status as AdminSupportTicket["status"],
    note: toOptionalString(row.note),
    reply: toOptionalString(row.reply),
    meta: toOptionalRecord(row.meta),
    createdAt: toEpochMs(row.createdAt),
    updatedAt: row.updatedAt == null ? undefined : toEpochMs(row.updatedAt),
  };
}

function mapReferralRow(row: ReferralRow): Referral {
  return {
    id: row.id,
    inviterAddress: row.inviterAddress,
    inviteeAddress: row.inviteeAddress,
    status: row.status as Referral["status"],
    rewardInviter: toOptionalNumber(row.rewardInviter),
    rewardInvitee: toOptionalNumber(row.rewardInvitee),
    triggerOrderId: toOptionalString(row.triggerOrderId),
    createdAt: toEpochMs(row.createdAt),
    rewardedAt: row.rewardedAt == null ? undefined : toEpochMs(row.rewardedAt),
  };
}

function mapReferralConfigRow(row: ReferralConfigRow): ReferralConfig {
  return {
    id: row.id,
    mode: row.mode as ReferralConfig["mode"],
    fixedInviter: toNumber(row.fixedInviter),
    fixedInvitee: toNumber(row.fixedInvitee),
    percentInviter: toNumber(row.percentInviter),
    percentInvitee: toNumber(row.percentInvitee),
    enabled: Boolean(row.enabled),
    updatedAt: row.updatedAt == null ? undefined : toEpochMs(row.updatedAt),
  };
}

function mapMemberRow(row: AdminMemberRow): AdminMember {
  return {
    id: row.id,
    userAddress: toOptionalString(row.userAddress),
    userName: toOptionalString(row.userName),
    tierId: toOptionalString(row.tierId),
    tierName: toOptionalString(row.tierName),
    points: toOptionalNumber(row.points),
    status: row.status as AdminMember["status"],
    expiresAt: row.expiresAt == null ? undefined : toEpochMs(row.expiresAt),
    note: toOptionalString(row.note),
    createdAt: toEpochMs(row.createdAt),
    updatedAt: row.updatedAt == null ? undefined : toEpochMs(row.updatedAt),
  };
}

function mapMembershipTierRow(row: AdminMembershipTierRow): AdminMembershipTier {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    badge: toOptionalString(row.badge),
    price: toOptionalNumber(row.price),
    durationDays: toOptionalNumber(row.durationDays),
    minPoints: toOptionalNumber(row.minPoints),
    status: row.status as AdminMembershipTier["status"],
    perks: (row.perks as AdminMembershipTier["perks"] | null) || undefined,
    createdAt: toEpochMs(row.createdAt),
    updatedAt: row.updatedAt == null ? undefined : toEpochMs(row.updatedAt),
  };
}

function mapPaymentEventRow(row: AdminPaymentEventRow): AdminPaymentEvent {
  return {
    id: row.id,
    provider: row.provider,
    event: row.event,
    orderNo: toOptionalString(row.orderNo),
    amount: toOptionalNumber(row.amount),
    status: toOptionalString(row.status),
    verified: Boolean(row.verified),
    createdAt: toEpochMs(row.createdAt),
    raw: toOptionalRecord(row.raw),
  };
}

function matchContains(value: string | undefined, keyword: string): boolean {
  if (!value) return false;
  return value.includes(keyword);
}

function filterOrders(
  rows: AdminOrder[],
  params: {
    stage?: string;
    q?: string;
    paymentStatus?: string;
    assignedTo?: string;
    userAddress?: string;
    address?: string;
    companionMissing?: boolean;
    excludeStages?: string[];
  }
) {
  const keyword = (params.q || "").trim();
  const excluded = new Set((params.excludeStages || []).filter(Boolean));

  return rows.filter((row) => {
    if (params.stage && params.stage !== "全部" && row.stage !== params.stage) return false;
    if (excluded.size > 0 && excluded.has(row.stage)) return false;
    if (params.paymentStatus && row.paymentStatus !== params.paymentStatus) return false;
    if (params.assignedTo && row.assignedTo !== params.assignedTo) return false;
    if (params.companionMissing && row.companionAddress) return false;

    if (params.address) {
      const byAddress =
        row.userAddress === params.address || row.companionAddress === params.address;
      if (!byAddress) return false;
    } else if (params.userAddress && row.userAddress !== params.userAddress) {
      return false;
    }

    if (!keyword) return true;
    return (
      matchContains(row.user, keyword) ||
      matchContains(row.item, keyword) ||
      matchContains(row.id, keyword)
    );
  });
}

export async function queryOrdersEdgeRead(params: {
  page: number;
  pageSize: number;
  stage?: string;
  q?: string;
  paymentStatus?: string;
  assignedTo?: string;
  userAddress?: string;
  address?: string;
  companionMissing?: boolean;
  excludeStages?: string[];
}) {
  const rows = await scanEdgeTableRows<AdminOrderRow>({
    table: "AdminOrder",
    baseParams: new URLSearchParams({
      select:
        "id,user,userAddress,companionAddress,item,amount,currency,paymentStatus,stage,note,assignedTo,source,chainDigest,chainStatus,serviceFee,deposit,meta,createdAt,updatedAt,deletedAt",
      order: "createdAt.desc,id.desc",
    }),
  });

  const mapped = rows.filter((row) => isNotDeleted(row.deletedAt)).map(mapOrderRow);
  const filtered = filterOrders(mapped, params).sort(compareByCreatedAtDesc);
  return paginateByPage(filtered, params.page, params.pageSize);
}

export async function queryOrdersCursorEdgeRead(params: {
  pageSize: number;
  stage?: string;
  q?: string;
  paymentStatus?: string;
  assignedTo?: string;
  userAddress?: string;
  address?: string;
  companionMissing?: boolean;
  excludeStages?: string[];
  cursor?: EdgeCursorPayload;
}) {
  const rows = await scanEdgeTableRows<AdminOrderRow>({
    table: "AdminOrder",
    baseParams: new URLSearchParams({
      select:
        "id,user,userAddress,companionAddress,item,amount,currency,paymentStatus,stage,note,assignedTo,source,chainDigest,chainStatus,serviceFee,deposit,meta,createdAt,updatedAt,deletedAt",
      order: "createdAt.desc,id.desc",
    }),
  });

  const mapped = rows.filter((row) => isNotDeleted(row.deletedAt)).map(mapOrderRow);
  const filtered = filterOrders(mapped, params).sort(compareByCreatedAtDesc);
  return paginateByCursor(filtered, params.pageSize, params.cursor);
}

export async function listOrdersEdgeRead(limit = 1_000): Promise<AdminOrder[]> {
  const rows = await scanEdgeTableRows<AdminOrderRow>({
    table: "AdminOrder",
    baseParams: new URLSearchParams({
      select:
        "id,user,userAddress,companionAddress,item,amount,currency,paymentStatus,stage,note,assignedTo,source,chainDigest,chainStatus,serviceFee,deposit,meta,createdAt,updatedAt,deletedAt",
      order: "createdAt.desc,id.desc",
    }),
  });
  return rows
    .filter((row) => isNotDeleted(row.deletedAt))
    .map(mapOrderRow)
    .sort(compareByCreatedAtDesc)
    .slice(0, Math.max(1, limit));
}

export async function getOrderByIdEdgeRead(orderId: string): Promise<AdminOrder | null> {
  if (!orderId) return null;
  const rows = await fetchEdgeRows<AdminOrderLookupRow>(
    "AdminOrder",
    new URLSearchParams({
      select:
        "id,user,userAddress,companionAddress,item,amount,currency,paymentStatus,stage,note,assignedTo,source,chainDigest,chainStatus,serviceFee,deposit,meta,createdAt,updatedAt,deletedAt",
      id: `eq.${orderId}`,
      deletedAt: "is.null",
      limit: "1",
    })
  );
  const row = rows[0];
  return row ? mapOrderRow(row) : null;
}

export async function listPlayersEdgeRead(limit = 500): Promise<AdminPlayer[]> {
  const [playerRows, activeOrderRows] = await Promise.all([
    scanEdgeTableRows<AdminPlayerRow>({
      table: "AdminPlayer",
      baseParams: new URLSearchParams({
        select:
          "id,name,role,contact,address,wechatQr,alipayQr,depositBase,depositLocked,creditMultiplier,status,notes,createdAt,updatedAt,deletedAt",
        order: "createdAt.desc,id.desc",
      }),
    }),
    scanEdgeTableRows<AdminOrderActiveExposureRow>({
      table: "AdminOrder",
      baseParams: new URLSearchParams({
        select: "assignedTo,amount,stage",
        assignedTo: "not.is.null",
      }),
    }),
  ]);

  const exposure = new Map<string, number>();
  for (const order of activeOrderRows) {
    const assignedTo = toOptionalString(order.assignedTo);
    if (!assignedTo) continue;
    if (order.stage === "已完成" || order.stage === "已取消") continue;
    exposure.set(assignedTo, (exposure.get(assignedTo) || 0) + toNumber(order.amount));
  }

  const mapped = playerRows
    .filter((row) => isNotDeleted(row.deletedAt))
    .map(mapPlayerRow)
    .sort(compareByCreatedAtDesc)
    .slice(0, Math.max(1, limit));

  return mapped.map((player) => {
    const keys = [player.id, player.name].filter(Boolean) as string[];
    const used = keys.reduce((sum, key) => sum + (exposure.get(key) || 0), 0);
    const depositBase = player.depositBase ?? 0;
    const multiplier = Math.min(5, Math.max(1, player.creditMultiplier ?? 1));
    const creditLimit = Number(((depositBase / DIAMOND_RATE) * multiplier).toFixed(2));
    const availableCredit = Number(Math.max(creditLimit - used, 0).toFixed(2));
    return {
      ...player,
      creditMultiplier: multiplier,
      creditLimit,
      usedCredit: Number(used.toFixed(2)),
      availableCredit,
    };
  });
}

export async function getPlayerByAddressEdgeRead(address: string) {
  const normalized = normalizeAddress(address || "");
  if (!normalized) return { player: null, conflict: false };

  const rows = await scanEdgeTableRows<AdminPlayerRow>({
    table: "AdminPlayer",
    baseParams: new URLSearchParams({
      select:
        "id,name,role,contact,address,wechatQr,alipayQr,depositBase,depositLocked,creditMultiplier,status,notes,createdAt,updatedAt,deletedAt",
      order: "createdAt.desc,id.desc",
    }),
  });

  const matched = rows
    .filter(
      (row) =>
        isNotDeleted(row.deletedAt) &&
        typeof row.address === "string" &&
        normalizeAddress(row.address) === normalized
    )
    .sort((a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt));

  if (matched.length === 0) return { player: null, conflict: false };
  if (matched.length > 1) return { player: null, conflict: true };
  return { player: mapPlayerRow(matched[0]), conflict: false };
}

export async function querySupportTicketsEdgeRead(params: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}) {
  const keyword = (params.q || "").trim();
  const rows = await scanEdgeTableRows<AdminSupportTicketRow>({
    table: "AdminSupportTicket",
    baseParams: new URLSearchParams({
      select:
        "id,userName,userAddress,contact,topic,message,status,note,reply,meta,createdAt,updatedAt,deletedAt",
      order: "createdAt.desc,id.desc",
    }),
  });

  const mapped = rows
    .filter((row) => isNotDeleted(row.deletedAt))
    .map(mapSupportTicketRow)
    .filter((row) => {
      if (params.status && params.status !== "全部" && row.status !== params.status) return false;
      if (!keyword) return true;
      return (
        matchContains(row.userName, keyword) ||
        matchContains(row.contact, keyword) ||
        matchContains(row.topic, keyword) ||
        matchContains(row.message, keyword) ||
        matchContains(row.id, keyword)
      );
    })
    .sort(compareByCreatedAtDesc);

  return paginateByPage(mapped, params.page, params.pageSize);
}

export async function querySupportTicketsCursorEdgeRead(params: {
  pageSize: number;
  status?: string;
  q?: string;
  cursor?: EdgeCursorPayload;
}) {
  const keyword = (params.q || "").trim();
  const rows = await scanEdgeTableRows<AdminSupportTicketRow>({
    table: "AdminSupportTicket",
    baseParams: new URLSearchParams({
      select:
        "id,userName,userAddress,contact,topic,message,status,note,reply,meta,createdAt,updatedAt,deletedAt",
      order: "createdAt.desc,id.desc",
    }),
  });

  const mapped = rows
    .filter((row) => isNotDeleted(row.deletedAt))
    .map(mapSupportTicketRow)
    .filter((row) => {
      if (params.status && params.status !== "全部" && row.status !== params.status) return false;
      if (!keyword) return true;
      return (
        matchContains(row.userName, keyword) ||
        matchContains(row.contact, keyword) ||
        matchContains(row.topic, keyword) ||
        matchContains(row.message, keyword) ||
        matchContains(row.id, keyword)
      );
    })
    .sort(compareByCreatedAtDesc);

  return paginateByCursor(mapped, params.pageSize, params.cursor);
}

export async function queryReferralsEdgeRead(params: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}) {
  const keyword = (params.q || "").trim();
  const rows = await scanEdgeTableRows<ReferralRow>({
    table: "Referral",
    baseParams: new URLSearchParams({
      select:
        "id,inviterAddress,inviteeAddress,status,rewardInviter,rewardInvitee,triggerOrderId,createdAt,rewardedAt",
      order: "createdAt.desc,id.desc",
    }),
  });

  const mapped = rows
    .map(mapReferralRow)
    .filter((row) => {
      if (params.status && params.status !== "全部" && row.status !== params.status) return false;
      if (!keyword) return true;
      return (
        matchContains(row.inviterAddress, keyword) ||
        matchContains(row.inviteeAddress, keyword) ||
        matchContains(row.triggerOrderId, keyword) ||
        matchContains(row.id, keyword)
      );
    })
    .sort(compareByCreatedAtDesc);

  return paginateByPage(mapped, params.page, params.pageSize);
}

export async function getReferralConfigEdgeRead(): Promise<ReferralConfig> {
  const rows = await fetchEdgeRows<ReferralConfigRow>(
    "ReferralConfig",
    new URLSearchParams({
      select: "id,mode,fixedInviter,fixedInvitee,percentInviter,percentInvitee,enabled,updatedAt",
      id: "eq.default",
      limit: "1",
    })
  );
  return rows[0] ? mapReferralConfigRow(rows[0]) : { ...DEFAULT_REFERRAL_CONFIG };
}

export async function updateReferralConfigEdgeWrite(
  patch: Partial<Omit<ReferralConfig, "id">>
): Promise<ReferralConfig> {
  const existing = await getReferralConfigEdgeRead();
  const nowIso = new Date().toISOString();

  const next: ReferralConfig = {
    ...existing,
    mode: patch.mode ?? existing.mode,
    fixedInviter: patch.fixedInviter ?? existing.fixedInviter,
    fixedInvitee: patch.fixedInvitee ?? existing.fixedInvitee,
    percentInviter: patch.percentInviter ?? existing.percentInviter,
    percentInvitee: patch.percentInvitee ?? existing.percentInvitee,
    enabled: patch.enabled ?? existing.enabled,
    updatedAt: toEpochMs(nowIso),
  };

  const data = {
    mode: next.mode,
    fixedInviter: next.fixedInviter,
    fixedInvitee: next.fixedInvitee,
    percentInviter: next.percentInviter,
    percentInvitee: next.percentInvitee,
    enabled: next.enabled,
    updatedAt: nowIso,
  };

  const existingRows = await fetchEdgeRows<{ id: string }>(
    "ReferralConfig",
    new URLSearchParams({ select: "id", id: "eq.default", limit: "1" }),
    "write"
  );

  if (existingRows.length > 0) {
    await patchEdgeRowsByFilter(
      "ReferralConfig",
      new URLSearchParams({
        id: "eq.default",
      }),
      data
    );
  } else {
    await insertEdgeRow("ReferralConfig", {
      id: "default",
      ...data,
    });
  }

  return next;
}

export async function queryMembersEdgeRead(params: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}) {
  const keyword = (params.q || "").trim();
  const rows = await scanEdgeTableRows<AdminMemberRow>({
    table: "AdminMember",
    baseParams: new URLSearchParams({
      select:
        "id,userAddress,userName,tierId,tierName,points,status,expiresAt,note,createdAt,updatedAt",
      order: "createdAt.desc,id.desc",
    }),
  });

  const mapped = rows
    .map(mapMemberRow)
    .filter((row) => {
      if (params.status && params.status !== "全部" && row.status !== params.status) return false;
      if (!keyword) return true;
      return (
        matchContains(row.userName, keyword) ||
        matchContains(row.userAddress, keyword) ||
        matchContains(row.tierName, keyword) ||
        matchContains(row.id, keyword)
      );
    })
    .sort(compareByCreatedAtDesc);

  return paginateByPage(mapped, params.page, params.pageSize);
}

export async function queryMembersCursorEdgeRead(params: {
  pageSize: number;
  status?: string;
  q?: string;
  cursor?: EdgeCursorPayload;
}) {
  const keyword = (params.q || "").trim();
  const rows = await scanEdgeTableRows<AdminMemberRow>({
    table: "AdminMember",
    baseParams: new URLSearchParams({
      select:
        "id,userAddress,userName,tierId,tierName,points,status,expiresAt,note,createdAt,updatedAt",
      order: "createdAt.desc,id.desc",
    }),
  });

  const mapped = rows
    .map(mapMemberRow)
    .filter((row) => {
      if (params.status && params.status !== "全部" && row.status !== params.status) return false;
      if (!keyword) return true;
      return (
        matchContains(row.userName, keyword) ||
        matchContains(row.userAddress, keyword) ||
        matchContains(row.tierName, keyword) ||
        matchContains(row.id, keyword)
      );
    })
    .sort(compareByCreatedAtDesc);

  return paginateByCursor(mapped, params.pageSize, params.cursor);
}

export async function queryMembershipTiersEdgeRead(params: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}) {
  const keyword = (params.q || "").trim();
  const rows = await scanEdgeTableRows<AdminMembershipTierRow>({
    table: "AdminMembershipTier",
    baseParams: new URLSearchParams({
      select: "id,name,level,badge,price,durationDays,minPoints,status,perks,createdAt,updatedAt",
      order: "level.asc,id.asc",
    }),
  });

  const mapped = rows
    .map(mapMembershipTierRow)
    .filter((row) => {
      if (params.status && params.status !== "全部" && row.status !== params.status) return false;
      if (!keyword) return true;
      return matchContains(row.name, keyword) || matchContains(row.badge, keyword);
    })
    .sort((a, b) => (a.level !== b.level ? a.level - b.level : a.id.localeCompare(b.id)));

  return paginateByPage(mapped, params.page, params.pageSize);
}

export async function queryMembershipTiersCursorEdgeRead(params: {
  pageSize: number;
  status?: string;
  q?: string;
  cursor?: EdgeCursorPayload;
}) {
  const keyword = (params.q || "").trim();
  const rows = await scanEdgeTableRows<AdminMembershipTierRow>({
    table: "AdminMembershipTier",
    baseParams: new URLSearchParams({
      select: "id,name,level,badge,price,durationDays,minPoints,status,perks,createdAt,updatedAt",
      order: "createdAt.desc,id.desc",
    }),
  });

  const mapped = rows
    .map(mapMembershipTierRow)
    .filter((row) => {
      if (params.status && params.status !== "全部" && row.status !== params.status) return false;
      if (!keyword) return true;
      return matchContains(row.name, keyword) || matchContains(row.id, keyword);
    })
    .sort(compareByCreatedAtDesc);

  return paginateByCursor(mapped, params.pageSize, params.cursor);
}

export async function getCompanionEarningsEdgeRead(params?: {
  from?: number;
  to?: number;
  limit?: number;
}) {
  const limit = Math.min(200, Math.max(5, params?.limit ?? 50));
  const orderParams = new URLSearchParams({
    select: "companionAddress,amount,serviceFee,createdAt",
    stage: "eq.已完成",
    companionAddress: "not.is.null",
    order: "createdAt.desc",
  });
  if (params?.from) {
    orderParams.append("createdAt", `gte.${new Date(params.from).toISOString()}`);
  }
  if (params?.to) {
    orderParams.append("createdAt", `lte.${new Date(params.to).toISOString()}`);
  }

  const [orderRows, playerRows] = await Promise.all([
    scanEdgeTableRows<{
      companionAddress: string | null;
      amount: string | number | null;
      serviceFee: string | number | null;
      createdAt: EdgeDateValue;
    }>({
      table: "AdminOrder",
      baseParams: orderParams,
    }),
    scanEdgeTableRows<{ address: string | null; name: string; deletedAt: EdgeDateValue }>({
      table: "AdminPlayer",
      baseParams: new URLSearchParams({
        select: "address,name,deletedAt",
      }),
    }),
  ]);

  const grouped = new Map<
    string,
    {
      companionAddress: string;
      orderCount: number;
      totalAmount: number;
      totalServiceFee: number;
      lastCompletedAt: number | null;
    }
  >();
  for (const row of orderRows) {
    const address = toOptionalString(row.companionAddress)?.trim();
    if (!address) continue;
    const createdAt = toEpochMs(row.createdAt);
    const current = grouped.get(address) || {
      companionAddress: address,
      orderCount: 0,
      totalAmount: 0,
      totalServiceFee: 0,
      lastCompletedAt: null,
    };
    current.orderCount += 1;
    current.totalAmount += toNumber(row.amount);
    current.totalServiceFee += toNumber(row.serviceFee);
    current.lastCompletedAt =
      current.lastCompletedAt == null ? createdAt : Math.max(current.lastCompletedAt, createdAt);
    grouped.set(address, current);
  }

  const playerNameByAddress = new Map<string, string>();
  for (const row of playerRows) {
    if (!isNotDeleted(row.deletedAt)) continue;
    const address = toOptionalString(row.address);
    if (!address) continue;
    playerNameByAddress.set(normalizeAddress(address), row.name);
  }

  const sorted = Array.from(grouped.values())
    .map((item) => ({
      companionAddress: item.companionAddress,
      companionName: playerNameByAddress.get(normalizeAddress(item.companionAddress)),
      orderCount: item.orderCount,
      totalAmount: Number(item.totalAmount.toFixed(2)),
      totalServiceFee: Number(item.totalServiceFee.toFixed(2)),
      lastCompletedAt: item.lastCompletedAt,
    }))
    .sort((a, b) => b.totalServiceFee - a.totalServiceFee);

  const totals = sorted.reduce(
    (acc, item) => ({
      orderCount: acc.orderCount + item.orderCount,
      totalAmount: Number((acc.totalAmount + item.totalAmount).toFixed(2)),
      totalServiceFee: Number((acc.totalServiceFee + item.totalServiceFee).toFixed(2)),
    }),
    { orderCount: 0, totalAmount: 0, totalServiceFee: 0 }
  );

  return {
    totals,
    items: sorted.slice(0, limit),
  };
}

export async function queryPaymentEventsEdgeRead(params: { page: number; pageSize: number }) {
  const rows = await scanEdgeTableRows<AdminPaymentEventRow>({
    table: "AdminPaymentEvent",
    baseParams: new URLSearchParams({
      select: "id,provider,event,orderNo,amount,status,verified,createdAt,raw",
      order: "createdAt.desc,id.desc",
    }),
  });
  const mapped = rows.map(mapPaymentEventRow).sort(compareByCreatedAtDesc);
  return paginateByPage(mapped, params.page, params.pageSize);
}

export async function queryPaymentEventsCursorEdgeRead(params: {
  pageSize: number;
  cursor?: EdgeCursorPayload;
}) {
  const rows = await scanEdgeTableRows<AdminPaymentEventRow>({
    table: "AdminPaymentEvent",
    baseParams: new URLSearchParams({
      select: "id,provider,event,orderNo,amount,status,verified,createdAt,raw",
      order: "createdAt.desc,id.desc",
    }),
  });
  const mapped = rows.map(mapPaymentEventRow).sort(compareByCreatedAtDesc);
  return paginateByCursor(mapped, params.pageSize, params.cursor);
}

export async function listChainOrdersForAdminEdgeRead(limit = 500) {
  const rows = await scanEdgeTableRows<ChainOrderRow>({
    table: "AdminOrder",
    baseParams: new URLSearchParams({
      select: "id,chainStatus,chainDigest,source,meta,createdAt,deletedAt",
      order: "createdAt.desc,id.desc",
    }),
  });

  return rows
    .filter((row) => {
      if (!isNotDeleted(row.deletedAt)) return false;
      return row.chainDigest !== null || row.chainStatus !== null || row.source === "chain";
    })
    .sort((a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt))
    .slice(0, Math.max(1, limit))
    .map((row) => ({
      id: row.id,
      chainStatus: toOptionalNumber(row.chainStatus),
      chainDigest: toOptionalString(row.chainDigest),
      source: toOptionalString(row.source),
      meta: toOptionalRecord(row.meta),
    }));
}

export async function listChainOrdersForAutoFinalizeEdgeRead(limit = 500) {
  return listChainOrdersForAdminEdgeRead(limit);
}

export async function listChainOrdersForCleanupEdgeRead(limit = 1_000) {
  const rows = await scanEdgeTableRows<ChainOrderRow>({
    table: "AdminOrder",
    baseParams: new URLSearchParams({
      select: "id,source,createdAt,deletedAt",
      source: "eq.chain",
      order: "createdAt.desc,id.desc",
    }),
  });

  return rows
    .filter((row) => isNotDeleted(row.deletedAt))
    .sort((a, b) => toEpochMs(b.createdAt) - toEpochMs(a.createdAt))
    .slice(0, Math.max(1, limit))
    .map((row) => ({
      id: row.id,
      source: toOptionalString(row.source),
      createdAt: toEpochMs(row.createdAt),
    }));
}

export async function listE2eOrderIdsEdgeRead() {
  const rows = await scanEdgeTableRows<E2eOrderRow>({
    table: "AdminOrder",
    baseParams: new URLSearchParams({
      select: "id,item,user,note",
      order: "createdAt.desc,id.desc",
    }),
  });
  return rows
    .filter((row) => {
      const id = row.id || "";
      const item = row.item || "";
      const user = row.user || "";
      const note = row.note || "";
      return (
        id.startsWith("E2E-ORDER-") ||
        item.includes("Admin E2E") ||
        item === "E2E Test Order" ||
        user === "E2E" ||
        user === "flow-test-user" ||
        note.includes("flow-test")
      );
    })
    .map((row) => row.id);
}
