import type { DuoOrder } from "./admin-types";
import { mapPaymentStatus } from "@/lib/chain/chain-status";
import {
  prisma,
  Prisma,
  type CursorPayload,
  appendCursorWhere,
  buildCursorPayload,
} from "./admin-store-utils";
import { notDeleted } from "@/lib/shared/soft-delete";

export function mapDuoOrder(row: {
  id: string;
  user: string;
  userAddress: string | null;
  companionAddressA: string | null;
  companionAddressB: string | null;
  item: string;
  amount: Prisma.Decimal | number;
  currency: string;
  paymentStatus: string;
  stage: string;
  note: string | null;
  assignedTo: string | null;
  source: string | null;
  chainDigest: string | null;
  chainStatus: number | null;
  serviceFee: Prisma.Decimal | number | null;
  depositPerCompanion: Prisma.Decimal | number | null;
  teamStatus: number | null;
  meta: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date | null;
}): DuoOrder {
  const isChain = row.chainDigest !== null || row.chainStatus !== null;
  const displayStatus =
    isChain && row.chainStatus !== null
      ? mapPaymentStatus(row.chainStatus)
      : row.paymentStatus || row.stage;

  return {
    id: row.id,
    user: row.user,
    userAddress: row.userAddress || undefined,
    companionAddressA: row.companionAddressA || undefined,
    companionAddressB: row.companionAddressB || undefined,
    item: row.item,
    amount: Number(row.amount),
    currency: row.currency,
    paymentStatus: row.paymentStatus,
    stage: row.stage as DuoOrder["stage"],
    displayStatus,
    note: row.note || undefined,
    assignedTo: row.assignedTo || undefined,
    source: row.source || undefined,
    chainDigest: row.chainDigest || undefined,
    chainStatus: row.chainStatus ?? undefined,
    serviceFee: row.serviceFee != null ? Number(row.serviceFee) : undefined,
    depositPerCompanion:
      row.depositPerCompanion != null ? Number(row.depositPerCompanion) : undefined,
    teamStatus: row.teamStatus ?? undefined,
    meta: (row.meta as Record<string, unknown> | null) || undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

export async function listDuoOrders(limit = 1000) {
  const rows = await prisma.duoOrder.findMany({
    where: notDeleted,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(mapDuoOrder);
}

function buildDuoOrderWhere(params: {
  stage?: string;
  q?: string;
  userAddress?: string;
  address?: string;
  hasOpenSlot?: boolean;
  excludeStages?: string[];
}): Prisma.DuoOrderWhereInput {
  const { stage, q, userAddress, address, hasOpenSlot, excludeStages } = params;
  const keyword = (q || "").trim();
  const where: Prisma.DuoOrderWhereInput = {};
  const andConditions: Prisma.DuoOrderWhereInput[] = [];
  if (stage && stage !== "全部") where.stage = stage;
  if (excludeStages && excludeStages.length > 0) where.stage = { notIn: excludeStages };
  if (hasOpenSlot) {
    andConditions.push({
      OR: [{ companionAddressA: null }, { companionAddressB: null }],
    });
  }
  if (address) {
    andConditions.push({
      OR: [
        { userAddress: address },
        { companionAddressA: address },
        { companionAddressB: address },
      ],
    });
  } else if (userAddress) {
    where.userAddress = userAddress;
  }
  if (keyword) {
    andConditions.push({
      OR: [
        { user: { contains: keyword } },
        { item: { contains: keyword } },
        { id: { contains: keyword } },
      ],
    });
  }
  if (andConditions.length > 0) where.AND = andConditions;
  return where;
}

export async function queryDuoOrders(params: {
  page: number;
  pageSize: number;
  stage?: string;
  q?: string;
  userAddress?: string;
  address?: string;
  hasOpenSlot?: boolean;
  excludeStages?: string[];
}) {
  const { page, pageSize, ...rest } = params;
  const where = buildDuoOrderWhere(rest);
  const total = await prisma.duoOrder.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.duoOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return { items: rows.map(mapDuoOrder), total, page: clampedPage, pageSize, totalPages };
}

export async function queryDuoOrdersCursor(params: {
  pageSize: number;
  stage?: string;
  q?: string;
  userAddress?: string;
  address?: string;
  hasOpenSlot?: boolean;
  excludeStages?: string[];
  cursor?: CursorPayload;
}) {
  const { pageSize, cursor, ...rest } = params;
  const where = buildDuoOrderWhere(rest);
  appendCursorWhere(where, cursor);
  const rows = await prisma.duoOrder.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapDuoOrder),
    nextCursor: hasMore ? buildCursorPayload(sliced[sliced.length - 1]) : null,
  };
}

export async function queryPublicDuoOrdersCursor(params: {
  pageSize: number;
  excludeStages?: string[];
  cursor?: { createdAt: number; id: string };
}) {
  const { pageSize, excludeStages, cursor } = params;
  const where: Prisma.DuoOrderWhereInput = {
    OR: [{ companionAddressA: null }, { companionAddressB: null }],
  };
  if (excludeStages && excludeStages.length > 0) {
    where.stage = { notIn: excludeStages };
  }
  if (cursor) {
    const cursorDate = new Date(cursor.createdAt);
    where.AND = [
      { OR: [{ createdAt: { lt: cursorDate } }, { createdAt: cursorDate, id: { lt: cursor.id } }] },
    ];
  }
  const rows = await prisma.duoOrder.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapDuoOrder),
    nextCursor: hasMore ? sliced[sliced.length - 1] : null,
  };
}
