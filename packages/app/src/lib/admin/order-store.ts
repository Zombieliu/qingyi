import type { AdminOrder } from "./admin-types";
import {
  prisma,
  Prisma,
  type CursorPayload,
  appendCursorWhere,
  buildCursorPayload,
} from "./admin-store-utils";
import { creditMantou } from "./mantou-store";

function mapOrder(row: {
  id: string;
  user: string;
  userAddress: string | null;
  companionAddress: string | null;
  item: string;
  amount: number;
  currency: string;
  paymentStatus: string;
  stage: string;
  note: string | null;
  assignedTo: string | null;
  source: string | null;
  chainDigest: string | null;
  chainStatus: number | null;
  serviceFee: number | null;
  deposit: number | null;
  meta: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date | null;
}): AdminOrder {
  return {
    id: row.id,
    user: row.user,
    userAddress: row.userAddress || undefined,
    companionAddress: row.companionAddress || undefined,
    item: row.item,
    amount: row.amount,
    currency: row.currency,
    paymentStatus: row.paymentStatus,
    stage: row.stage as AdminOrder["stage"],
    note: row.note || undefined,
    assignedTo: row.assignedTo || undefined,
    source: row.source || undefined,
    chainDigest: row.chainDigest || undefined,
    chainStatus: row.chainStatus ?? undefined,
    serviceFee: row.serviceFee ?? undefined,
    deposit: row.deposit ?? undefined,
    meta: (row.meta as Record<string, unknown> | null) || undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

export async function listOrders() {
  const rows = await prisma.adminOrder.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(mapOrder);
}

const CHAIN_ORDER_WHERE: Prisma.AdminOrderWhereInput = {
  OR: [{ chainDigest: { not: null } }, { chainStatus: { not: null } }, { source: "chain" }],
};

export async function listChainOrdersForAdmin() {
  const rows = await prisma.adminOrder.findMany({
    where: CHAIN_ORDER_WHERE,
    select: {
      id: true,
      chainStatus: true,
      chainDigest: true,
      source: true,
      meta: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    chainStatus: row.chainStatus ?? undefined,
    chainDigest: row.chainDigest ?? undefined,
    source: row.source ?? undefined,
    meta: (row.meta as Record<string, unknown> | null) || undefined,
  }));
}

export async function listChainOrdersForAutoFinalize() {
  const rows = await prisma.adminOrder.findMany({
    where: CHAIN_ORDER_WHERE,
    select: {
      id: true,
      chainStatus: true,
      chainDigest: true,
      source: true,
      meta: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    chainStatus: row.chainStatus ?? undefined,
    chainDigest: row.chainDigest ?? undefined,
    source: row.source ?? undefined,
    meta: (row.meta as Record<string, unknown> | null) || undefined,
  }));
}

export async function listChainOrdersForCleanup() {
  const rows = await prisma.adminOrder.findMany({
    where: { source: "chain" },
    select: {
      id: true,
      source: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    source: row.source ?? undefined,
    createdAt: row.createdAt.getTime(),
  }));
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

  if (stage && stage !== "全部") {
    where.stage = stage;
  }
  if (excludeStages && excludeStages.length > 0) {
    where.stage = { notIn: excludeStages };
  }
  if (paymentStatus) {
    where.paymentStatus = paymentStatus;
  }
  if (assignedTo) {
    where.assignedTo = assignedTo;
  }
  if (companionMissing) {
    where.companionAddress = null;
  }
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
  if (andConditions.length > 0) {
    where.AND = andConditions;
  }
  return where;
}

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
  const {
    page,
    pageSize,
    stage,
    q,
    paymentStatus,
    assignedTo,
    userAddress,
    address,
    companionMissing,
    excludeStages,
  } = params;
  const where = buildOrderWhere({
    stage,
    q,
    paymentStatus,
    assignedTo,
    userAddress,
    address,
    companionMissing,
    excludeStages,
  });

  const total = await prisma.adminOrder.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.adminOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });

  return {
    items: rows.map(mapOrder),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
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
  const {
    pageSize,
    stage,
    q,
    paymentStatus,
    assignedTo,
    userAddress,
    address,
    companionMissing,
    excludeStages,
    cursor,
  } = params;
  const where = buildOrderWhere({
    stage,
    q,
    paymentStatus,
    assignedTo,
    userAddress,
    address,
    companionMissing,
    excludeStages,
  });
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

export async function hasOrdersForAddress(address: string) {
  if (!address) return false;
  const count = await prisma.adminOrder.count({ where: { userAddress: address } });
  return count > 0;
}

export async function getOrderById(orderId: string) {
  const row = await prisma.adminOrder.findUnique({ where: { id: orderId } });
  return row ? mapOrder(row) : null;
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
      {
        OR: [{ createdAt: { lt: cursorDate } }, { createdAt: cursorDate, id: { lt: cursor.id } }],
      },
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

export async function removeOrders(orderIds: string[]) {
  const ids = orderIds.filter(Boolean);
  if (ids.length === 0) return 0;
  const result = await prisma.adminOrder.deleteMany({ where: { id: { in: ids } } });
  return result.count;
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

export async function addOrder(order: AdminOrder) {
  const row = await prisma.adminOrder.create({
    data: {
      id: order.id,
      user: order.user,
      userAddress: order.userAddress ?? null,
      companionAddress: order.companionAddress ?? null,
      item: order.item,
      amount: order.amount,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      stage: order.stage,
      note: order.note ?? null,
      assignedTo: order.assignedTo ?? null,
      source: order.source ?? null,
      chainDigest: order.chainDigest ?? null,
      chainStatus: order.chainStatus ?? null,
      serviceFee: order.serviceFee ?? null,
      deposit: order.deposit ?? null,
      meta: order.meta ? (order.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      createdAt: new Date(order.createdAt),
      updatedAt: order.updatedAt ? new Date(order.updatedAt) : null,
    },
  });
  return mapOrder(row);
}

export async function updateOrder(orderId: string, patch: Partial<AdminOrder>) {
  try {
    const data: Prisma.AdminOrderUpdateInput = {
      updatedAt: new Date(),
    };
    if (patch.paymentStatus !== undefined) data.paymentStatus = patch.paymentStatus;
    if (patch.note !== undefined) data.note = patch.note;
    if (patch.assignedTo !== undefined) data.assignedTo = patch.assignedTo;
    if (patch.stage !== undefined) data.stage = patch.stage;
    if (patch.user !== undefined) data.user = patch.user;
    if (patch.userAddress !== undefined) data.userAddress = patch.userAddress;
    if (patch.companionAddress !== undefined) data.companionAddress = patch.companionAddress;
    if (patch.item !== undefined) data.item = patch.item;
    if (patch.amount !== undefined) data.amount = patch.amount;
    if (patch.currency !== undefined) data.currency = patch.currency;
    if (patch.source !== undefined) data.source = patch.source;
    if (patch.chainDigest !== undefined) data.chainDigest = patch.chainDigest;
    if (patch.chainStatus !== undefined) data.chainStatus = patch.chainStatus;
    if (patch.serviceFee !== undefined) data.serviceFee = patch.serviceFee;
    if (patch.deposit !== undefined) data.deposit = patch.deposit;
    if (patch.meta !== undefined) {
      const current = await prisma.adminOrder.findUnique({
        where: { id: orderId },
        select: { meta: true },
      });
      const merged = {
        ...(current?.meta ? (current.meta as Record<string, unknown>) : {}),
        ...(patch.meta || {}),
      };
      data.meta = Object.keys(merged).length ? (merged as Prisma.InputJsonValue) : Prisma.DbNull;
    }

    const row = await prisma.adminOrder.update({
      where: { id: orderId },
      data,
    });
    const mapped = mapOrder(row);
    await maybeCreditMantouForCompletedOrder(mapped);
    return mapped;
  } catch {
    return null;
  }
}

async function maybeCreditMantouForCompletedOrder(order: AdminOrder) {
  if (order.stage !== "已完成") return;
  const address = (order.companionAddress || "").trim();
  if (!address) return;
  const meta = (order.meta || {}) as Record<string, unknown>;
  const diamondCharge = Number(meta.diamondCharge ?? 0);
  if (!Number.isFinite(diamondCharge) || diamondCharge <= 0) return;
  try {
    await creditMantou({
      address,
      amount: Math.floor(diamondCharge),
      orderId: order.id,
      note: `来自订单 ${order.id} 的钻石兑换`,
    });
  } catch {
    // Ignore auto-credit failures to avoid blocking order updates.
  }
}

export async function updateOrderIfUnassigned(orderId: string, patch: Partial<AdminOrder>) {
  try {
    const current = await prisma.adminOrder.findUnique({
      where: { id: orderId },
      select: { meta: true, companionAddress: true },
    });
    if (!current || current.companionAddress) return null;

    const data: Prisma.AdminOrderUpdateManyMutationInput = {
      updatedAt: new Date(),
    };
    if (patch.stage !== undefined) data.stage = patch.stage;
    if (patch.companionAddress !== undefined) data.companionAddress = patch.companionAddress;
    if (patch.meta !== undefined) {
      const merged = {
        ...(current.meta ? (current.meta as Record<string, unknown>) : {}),
        ...(patch.meta || {}),
      };
      data.meta = Object.keys(merged).length ? (merged as Prisma.InputJsonValue) : Prisma.DbNull;
    }

    const result = await prisma.adminOrder.updateMany({
      where: { id: orderId, companionAddress: null },
      data,
    });
    if (result.count === 0) return null;

    const row = await prisma.adminOrder.findUnique({ where: { id: orderId } });
    return row ? mapOrder(row) : null;
  } catch {
    return null;
  }
}

export async function upsertOrder(order: AdminOrder) {
  const row = await prisma.adminOrder.upsert({
    where: { id: order.id },
    create: {
      id: order.id,
      user: order.user,
      userAddress: order.userAddress ?? null,
      companionAddress: order.companionAddress ?? null,
      item: order.item,
      amount: order.amount,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      stage: order.stage,
      note: order.note ?? null,
      assignedTo: order.assignedTo ?? null,
      source: order.source ?? null,
      chainDigest: order.chainDigest ?? null,
      chainStatus: order.chainStatus ?? null,
      serviceFee: order.serviceFee ?? null,
      deposit: order.deposit ?? null,
      meta: order.meta ? (order.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      createdAt: new Date(order.createdAt),
      updatedAt: order.updatedAt ? new Date(order.updatedAt) : null,
    },
    update: {
      user: order.user,
      userAddress: order.userAddress ?? null,
      companionAddress: order.companionAddress ?? null,
      item: order.item,
      amount: order.amount,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      stage: order.stage,
      note: order.note ?? null,
      assignedTo: order.assignedTo ?? null,
      source: order.source ?? null,
      chainDigest: order.chainDigest ?? null,
      chainStatus: order.chainStatus ?? null,
      serviceFee: order.serviceFee ?? null,
      deposit: order.deposit ?? null,
      meta: order.meta ? (order.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      updatedAt: new Date(),
    },
  });
  return mapOrder(row);
}
