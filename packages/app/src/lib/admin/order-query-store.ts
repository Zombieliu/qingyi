import type { AdminOrder } from "./admin-types";
import { mapPaymentStatus } from "@/lib/chain/chain-status";
import {
  prisma,
  Prisma,
  type CursorPayload,
  appendCursorWhere,
  buildCursorPayload,
} from "./admin-store-utils";
import { notDeleted } from "@/lib/shared/soft-delete";

export function mapOrder(row: {
  id: string;
  user: string;
  userAddress: string | null;
  companionAddress: string | null;
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
  deposit: Prisma.Decimal | number | null;
  meta: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date | null;
}): AdminOrder {
  const isChain = row.chainDigest !== null || row.chainStatus !== null;
  const displayStatus =
    isChain && row.chainStatus !== null
      ? mapPaymentStatus(row.chainStatus)
      : row.paymentStatus || row.stage;

  return {
    id: row.id,
    user: row.user,
    userAddress: row.userAddress || undefined,
    companionAddress: row.companionAddress || undefined,
    item: row.item,
    amount: Number(row.amount),
    currency: row.currency,
    paymentStatus: row.paymentStatus,
    stage: row.stage as AdminOrder["stage"],
    displayStatus,
    note: row.note || undefined,
    assignedTo: row.assignedTo || undefined,
    source: row.source || undefined,
    chainDigest: row.chainDigest || undefined,
    chainStatus: row.chainStatus ?? undefined,
    serviceFee: row.serviceFee != null ? Number(row.serviceFee) : undefined,
    deposit: row.deposit != null ? Number(row.deposit) : undefined,
    meta: (row.meta as Record<string, unknown> | null) || undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

export async function listOrders(limit = 1000) {
  const rows = await prisma.adminOrder.findMany({
    where: notDeleted,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return rows.map(mapOrder);
}

function buildOrderWhere(params: {
  stage?: string;
  q?: string;
  paymentStatus?: string;
  assignedTo?: string;
  userAddress?: string;
  address?: string;
  companionMissing?: boolean;
  excludeStages?: string[];
}): Prisma.AdminOrderWhereInput {
  const {
    stage,
    q,
    paymentStatus,
    assignedTo,
    userAddress,
    address,
    companionMissing,
    excludeStages,
  } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminOrderWhereInput = {};
  const andConditions: Prisma.AdminOrderWhereInput[] = [];
  if (stage && stage !== "全部") where.stage = stage;
  if (excludeStages && excludeStages.length > 0) where.stage = { notIn: excludeStages };
  if (paymentStatus) where.paymentStatus = paymentStatus;
  if (assignedTo) where.assignedTo = assignedTo;
  if (companionMissing) where.companionAddress = null;
  if (address) {
    andConditions.push({ OR: [{ userAddress: address }, { companionAddress: address }] });
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
// __PLACEHOLDER_QUERY_FNS__

export async function queryOrders(params: {
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
  const { page, pageSize, ...rest } = params;
  const where = buildOrderWhere(rest);
  const total = await prisma.adminOrder.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.adminOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return { items: rows.map(mapOrder), total, page: clampedPage, pageSize, totalPages };
}

export async function queryOrdersCursor(params: {
  pageSize: number;
  stage?: string;
  q?: string;
  paymentStatus?: string;
  assignedTo?: string;
  userAddress?: string;
  address?: string;
  companionMissing?: boolean;
  excludeStages?: string[];
  cursor?: CursorPayload;
}) {
  const { pageSize, cursor, ...rest } = params;
  const where = buildOrderWhere(rest);
  appendCursorWhere(where, cursor);
  const rows = await prisma.adminOrder.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapOrder),
    nextCursor: hasMore ? buildCursorPayload(sliced[sliced.length - 1]) : null,
  };
}
// __PLACEHOLDER_MORE_FNS__

export async function hasOrdersForAddress(address: string) {
  if (!address) return false;
  const count = await prisma.adminOrder.count({ where: { userAddress: address } });
  return count > 0;
}

export async function queryPublicOrdersCursor(params: {
  pageSize: number;
  excludeStages?: string[];
  cursor?: { createdAt: number; id: string };
}) {
  const { pageSize, excludeStages, cursor } = params;
  const where: Prisma.AdminOrderWhereInput = { companionAddress: null };
  if (excludeStages && excludeStages.length > 0) {
    where.stage = { notIn: excludeStages };
  }
  if (cursor) {
    const cursorDate = new Date(cursor.createdAt);
    where.AND = [
      { OR: [{ createdAt: { lt: cursorDate } }, { createdAt: cursorDate, id: { lt: cursor.id } }] },
    ];
  }
  const rows = await prisma.adminOrder.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapOrder),
    nextCursor: hasMore ? sliced[sliced.length - 1] : null,
  };
}

export async function listE2eOrderIds() {
  const rows = await prisma.adminOrder.findMany({
    where: {
      OR: [
        { id: { startsWith: "E2E-ORDER-" } },
        { item: { contains: "Admin E2E" } },
        { item: { equals: "E2E Test Order" } },
        { user: { equals: "E2E" } },
        { user: { equals: "flow-test-user" } },
        { note: { contains: "flow-test" } },
      ],
    },
    select: { id: true },
  });
  return rows.map((row) => row.id);
}
