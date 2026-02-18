import "server-only";
import type {
  AdminAnnouncement,
  AdminAuditLog,
  AdminCoupon,
  AdminGuardianApplication,
  AdminInvoiceRequest,
  AdminMember,
  AdminMembershipRequest,
  AdminMembershipTier,
  MantouTransaction,
  MantouWallet,
  MantouWithdrawRequest,
  AdminOrder,
  AdminPaymentEvent,
  LedgerRecord,
  AdminPlayer,
  AdminSupportTicket,
  AdminSession,
  AdminAccessToken,
} from "./admin-types";
import { prisma } from "../db";
import { Prisma } from "@prisma/client";
import { getCache, setCache } from "../server-cache";

const MAX_AUDIT_LOGS = Number(process.env.ADMIN_AUDIT_LOG_LIMIT || "1000");
const MAX_PAYMENT_EVENTS = Number(process.env.ADMIN_PAYMENT_EVENT_LIMIT || "1000");

type CursorPayload = { createdAt: number; id: string };

function buildCursorPayload(row: { id: string; createdAt: Date }): CursorPayload {
  return { id: row.id, createdAt: row.createdAt.getTime() };
}

function appendCursorWhere(where: { AND?: unknown }, cursor?: CursorPayload) {
  if (!cursor) return;
  const cursorDate = new Date(cursor.createdAt);
  const condition = {
    OR: [
      { createdAt: { lt: cursorDate } },
      { createdAt: cursorDate, id: { lt: cursor.id } },
    ],
  };
  if (where.AND) {
    const existing = Array.isArray(where.AND) ? where.AND : [where.AND];
    where.AND = [...existing, condition];
  } else {
    where.AND = [condition];
  }
}

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

function mapPlayer(row: {
  id: string;
  name: string;
  role: string | null;
  contact: string | null;
  address: string | null;
  wechatQr: string | null;
  alipayQr: string | null;
  depositBase: number | null;
  depositLocked: number | null;
  creditMultiplier: number | null;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}): AdminPlayer {
  return {
    id: row.id,
    name: row.name,
    role: row.role || undefined,
    contact: row.contact || undefined,
    address: row.address || undefined,
    wechatQr: row.wechatQr || undefined,
    alipayQr: row.alipayQr || undefined,
    depositBase: row.depositBase ?? undefined,
    depositLocked: row.depositLocked ?? undefined,
    creditMultiplier: row.creditMultiplier ?? undefined,
    status: row.status as AdminPlayer["status"],
    notes: row.notes || undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

function mapAnnouncement(row: {
  id: string;
  title: string;
  tag: string;
  content: string;
  status: string;
  createdAt: Date;
  updatedAt: Date | null;
}): AdminAnnouncement {
  return {
    id: row.id,
    title: row.title,
    tag: row.tag,
    content: row.content,
    status: row.status as AdminAnnouncement["status"],
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

function mapMantouWallet(row: {
  address: string;
  balance: number;
  frozen: number;
  createdAt: Date;
  updatedAt: Date | null;
}): MantouWallet {
  return {
    address: row.address,
    balance: row.balance,
    frozen: row.frozen,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

function mapMantouTransaction(row: {
  id: string;
  address: string;
  type: string;
  amount: number;
  orderId: string | null;
  note: string | null;
  createdAt: Date;
}): MantouTransaction {
  return {
    id: row.id,
    address: row.address,
    type: row.type,
    amount: row.amount,
    orderId: row.orderId || undefined,
    note: row.note || undefined,
    createdAt: row.createdAt.getTime(),
  };
}

function mapMantouWithdraw(row: {
  id: string;
  address: string;
  amount: number;
  status: string;
  note: string | null;
  account: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}): MantouWithdrawRequest {
  return {
    id: row.id,
    address: row.address,
    amount: row.amount,
    status: row.status as MantouWithdrawRequest["status"],
    note: row.note || undefined,
    account: row.account || undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

function mapSupportTicket(row: {
  id: string;
  userName: string | null;
  userAddress: string | null;
  contact: string | null;
  topic: string | null;
  message: string;
  status: string;
  note: string | null;
  meta: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date | null;
}): AdminSupportTicket {
  return {
    id: row.id,
    userName: row.userName || undefined,
    userAddress: row.userAddress || undefined,
    contact: row.contact || undefined,
    topic: row.topic || undefined,
    message: row.message,
    status: row.status as AdminSupportTicket["status"],
    note: row.note || undefined,
    meta: (row.meta as Record<string, unknown> | null) || undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

function mapCoupon(row: {
  id: string;
  title: string;
  code: string | null;
  description: string | null;
  discount: number | null;
  minSpend: number | null;
  status: string;
  startsAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}): AdminCoupon {
  return {
    id: row.id,
    title: row.title,
    code: row.code || undefined,
    description: row.description || undefined,
    discount: row.discount ?? undefined,
    minSpend: row.minSpend ?? undefined,
    status: row.status as AdminCoupon["status"],
    startsAt: row.startsAt ? row.startsAt.getTime() : undefined,
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

function mapInvoiceRequest(row: {
  id: string;
  user: string | null;
  userAddress: string | null;
  contact: string | null;
  email: string | null;
  orderId: string | null;
  amount: number | null;
  title: string | null;
  taxId: string | null;
  address: string | null;
  status: string;
  note: string | null;
  meta: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date | null;
}): AdminInvoiceRequest {
  return {
    id: row.id,
    user: row.user || undefined,
    userAddress: row.userAddress || undefined,
    contact: row.contact || undefined,
    email: row.email || undefined,
    orderId: row.orderId || undefined,
    amount: row.amount ?? undefined,
    title: row.title || undefined,
    taxId: row.taxId || undefined,
    address: row.address || undefined,
    status: row.status as AdminInvoiceRequest["status"],
    note: row.note || undefined,
    meta: (row.meta as Record<string, unknown> | null) || undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

function mapGuardianApplication(row: {
  id: string;
  user: string | null;
  userAddress: string | null;
  contact: string | null;
  games: string | null;
  experience: string | null;
  availability: string | null;
  status: string;
  note: string | null;
  meta: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date | null;
}): AdminGuardianApplication {
  return {
    id: row.id,
    user: row.user || undefined,
    userAddress: row.userAddress || undefined,
    contact: row.contact || undefined,
    games: row.games || undefined,
    experience: row.experience || undefined,
    availability: row.availability || undefined,
    status: row.status as AdminGuardianApplication["status"],
    note: row.note || undefined,
    meta: (row.meta as Record<string, unknown> | null) || undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

function mapMembershipTier(row: {
  id: string;
  name: string;
  level: number;
  badge: string | null;
  price: number | null;
  durationDays: number | null;
  minPoints: number | null;
  status: string;
  perks: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date | null;
}): AdminMembershipTier {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    badge: row.badge || undefined,
    price: row.price ?? undefined,
    durationDays: row.durationDays ?? undefined,
    minPoints: row.minPoints ?? undefined,
    status: row.status as AdminMembershipTier["status"],
    perks: (row.perks as AdminMembershipTier["perks"] | null) || undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

function mapMember(row: {
  id: string;
  userAddress: string | null;
  userName: string | null;
  tierId: string | null;
  tierName: string | null;
  points: number | null;
  status: string;
  expiresAt: Date | null;
  note: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}): AdminMember {
  return {
    id: row.id,
    userAddress: row.userAddress || undefined,
    userName: row.userName || undefined,
    tierId: row.tierId || undefined,
    tierName: row.tierName || undefined,
    points: row.points ?? undefined,
    status: row.status as AdminMember["status"],
    expiresAt: row.expiresAt ? row.expiresAt.getTime() : undefined,
    note: row.note || undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

function mapMembershipRequest(row: {
  id: string;
  userAddress: string | null;
  userName: string | null;
  contact: string | null;
  tierId: string | null;
  tierName: string | null;
  status: string;
  note: string | null;
  meta: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date | null;
}): AdminMembershipRequest {
  return {
    id: row.id,
    userAddress: row.userAddress || undefined,
    userName: row.userName || undefined,
    contact: row.contact || undefined,
    tierId: row.tierId || undefined,
    tierName: row.tierName || undefined,
    status: row.status as AdminMembershipRequest["status"],
    note: row.note || undefined,
    meta: (row.meta as Record<string, unknown> | null) || undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

function mapSession(row: {
  id: string;
  tokenHash: string;
  role: string;
  label: string | null;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date | null;
  ip: string | null;
  userAgent: string | null;
}): AdminSession {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    role: row.role as AdminSession["role"],
    label: row.label || undefined,
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.getTime() : undefined,
    ip: row.ip || undefined,
    userAgent: row.userAgent || undefined,
  };
}

function mapAccessToken(row: {
  id: string;
  tokenHash: string;
  tokenPrefix: string;
  role: string;
  label: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date | null;
  lastUsedAt: Date | null;
}): AdminAccessToken {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    tokenPrefix: row.tokenPrefix,
    role: row.role as AdminAccessToken["role"],
    label: row.label || undefined,
    status: row.status as AdminAccessToken["status"],
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.getTime() : undefined,
  };
}

function mapAudit(row: {
  id: string;
  actorRole: string;
  actorSessionId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: Prisma.JsonValue | null;
  ip: string | null;
  createdAt: Date;
}): AdminAuditLog {
  return {
    id: row.id,
    actorRole: row.actorRole as AdminAuditLog["actorRole"],
    actorSessionId: row.actorSessionId || undefined,
    action: row.action,
    targetType: row.targetType || undefined,
    targetId: row.targetId || undefined,
    meta: (row.meta as Record<string, unknown> | null) || undefined,
    ip: row.ip || undefined,
    createdAt: row.createdAt.getTime(),
  };
}

function mapPayment(row: {
  id: string;
  provider: string;
  event: string;
  orderNo: string | null;
  amount: number | null;
  status: string | null;
  verified: boolean;
  createdAt: Date;
  raw: Prisma.JsonValue | null;
}): AdminPaymentEvent {
  return {
    id: row.id,
    provider: row.provider,
    event: row.event,
    orderNo: row.orderNo || undefined,
    amount: row.amount ?? undefined,
    status: row.status || undefined,
    verified: row.verified,
    createdAt: row.createdAt.getTime(),
    raw: (row.raw as Record<string, unknown> | null) || undefined,
  };
}

function mapLedgerRecord(row: {
  id: string;
  userAddress: string;
  diamondAmount: number;
  amount: number | null;
  currency: string | null;
  channel: string | null;
  status: string;
  orderId: string | null;
  receiptId: string | null;
  source: string | null;
  note: string | null;
  meta: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date | null;
}): LedgerRecord {
  return {
    id: row.id,
    userAddress: row.userAddress,
    diamondAmount: row.diamondAmount,
    amount: row.amount ?? undefined,
    currency: row.currency || undefined,
    channel: row.channel || undefined,
    status: row.status,
    orderId: row.orderId || undefined,
    receiptId: row.receiptId || undefined,
    source: row.source || undefined,
    note: row.note || undefined,
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
  const { stage, q, paymentStatus, assignedTo, userAddress, address, companionMissing, excludeStages } = params;
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
      OR: [{ user: { contains: keyword } }, { item: { contains: keyword } }, { id: { contains: keyword } }],
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
  const { page, pageSize, stage, q, paymentStatus, assignedTo, userAddress, address, companionMissing, excludeStages } =
    params;
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
  const { pageSize, stage, q, paymentStatus, assignedTo, userAddress, address, companionMissing, excludeStages, cursor } =
    params;
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
        OR: [
          { createdAt: { lt: cursorDate } },
          { createdAt: cursorDate, id: { lt: cursor.id } },
        ],
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

export async function listPlayers() {
  const rows = await prisma.adminPlayer.findMany({ orderBy: { createdAt: "desc" } });
  const players = rows.map(mapPlayer);
  const activeOrders = await prisma.adminOrder.groupBy({
    by: ["assignedTo"],
    where: { stage: { notIn: ["已完成", "已取消"] }, assignedTo: { not: null } },
    _sum: { amount: true },
  });
  const exposure = new Map<string, number>();
  for (const order of activeOrders) {
    const key = (order.assignedTo || "").trim();
    if (!key) continue;
    exposure.set(key, Number(order._sum.amount || 0));
  }

  const DIAMOND_RATE = 10;
  return players.map((player) => {
    const keys = [player.id, player.name].filter(Boolean) as string[];
    const used = keys.reduce((sum, key) => sum + (exposure.get(key) || 0), 0);
    const depositBase = player.depositBase ?? 0;
    const multiplier = Math.min(5, Math.max(1, player.creditMultiplier ?? 1));
    const creditLimit = Number(((depositBase / DIAMOND_RATE) * multiplier).toFixed(2));
    const available = Number(Math.max(creditLimit - used, 0).toFixed(2));
    return {
      ...player,
      creditMultiplier: multiplier,
      creditLimit,
      usedCredit: Number(used.toFixed(2)),
      availableCredit: available,
    };
  });
}

export async function getPlayerById(playerId: string) {
  if (!playerId) return null;
  const row = await prisma.adminPlayer.findUnique({ where: { id: playerId } });
  return row ? mapPlayer(row) : null;
}

export async function getCompanionEarnings(params?: { from?: number; to?: number; limit?: number }) {
  const where: Prisma.AdminOrderWhereInput = {
    stage: "已完成",
    companionAddress: { not: null },
  };
  if (params?.from || params?.to) {
    where.createdAt = {};
    if (params.from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(params.from);
    if (params.to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(params.to);
  }
  const limit = Math.min(200, Math.max(5, params?.limit ?? 50));
  const [grouped, totals] = await Promise.all([
    prisma.adminOrder.groupBy({
      by: ["companionAddress"],
      where,
      _count: { id: true },
      _sum: { amount: true, serviceFee: true },
      _max: { createdAt: true },
      orderBy: {
        _sum: { serviceFee: "desc" },
      },
      take: limit,
    }),
    prisma.adminOrder.aggregate({
      where,
      _count: { id: true },
      _sum: { amount: true, serviceFee: true },
    }),
  ]);

  const addresses = grouped
    .map((row) => (row.companionAddress || "").trim())
    .filter(Boolean);
  const playerRows = addresses.length
    ? await prisma.adminPlayer.findMany({
        where: { address: { in: addresses } },
        select: { address: true, name: true },
      })
    : [];
  const playerNameMap = new Map(
    playerRows.map((row) => [normalizePlayerAddress(row.address || ""), row.name])
  );

  const items = grouped.map((row) => {
    const address = (row.companionAddress || "").trim();
    return {
      companionAddress: address,
      companionName: playerNameMap.get(normalizePlayerAddress(address)),
      orderCount: row._count.id ?? 0,
      totalAmount: Number(row._sum.amount ?? 0),
      totalServiceFee: Number(row._sum.serviceFee ?? 0),
      lastCompletedAt: row._max.createdAt ? row._max.createdAt.getTime() : null,
    };
  });

  return {
    totals: {
      orderCount: totals._count.id ?? 0,
      totalAmount: Number(totals._sum.amount ?? 0),
      totalServiceFee: Number(totals._sum.serviceFee ?? 0),
    },
    items,
  };
}

export async function listPlayersPublic() {
  const rows = await prisma.adminPlayer.findMany({
    select: {
      id: true,
      name: true,
      role: true,
      status: true,
      depositBase: true,
      depositLocked: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role || undefined,
    status: row.status as AdminPlayer["status"],
    depositBase: row.depositBase ?? undefined,
    depositLocked: row.depositLocked ?? undefined,
  }));
}

function normalizePlayerAddress(address: string) {
  return (address || "").trim();
}

export async function getPlayerByAddress(address: string) {
  const normalized = normalizePlayerAddress(address);
  if (!normalized) return { player: null, conflict: false };
  const rows = await prisma.adminPlayer.findMany({
    where: { address: { equals: normalized, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: 2,
  });
  if (rows.length === 0) return { player: null, conflict: false };
  if (rows.length > 1) return { player: null, conflict: true };
  return { player: mapPlayer(rows[0]), conflict: false };
}

export async function updatePlayerStatusByAddress(address: string, status: AdminPlayer["status"]) {
  const normalized = normalizePlayerAddress(address);
  if (!normalized) return { player: null, conflict: false };
  const rows = await prisma.adminPlayer.findMany({
    where: { address: { equals: normalized, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: 2,
  });
  if (rows.length === 0) return { player: null, conflict: false };
  if (rows.length > 1) return { player: null, conflict: true };
  try {
    const row = await prisma.adminPlayer.update({
      where: { id: rows[0].id },
      data: { status, updatedAt: new Date() },
    });
    return { player: mapPlayer(row), conflict: false };
  } catch {
    return { player: null, conflict: false };
  }
}

export async function addPlayer(player: AdminPlayer) {
  const row = await prisma.adminPlayer.create({
    data: {
      id: player.id,
      name: player.name,
      role: player.role ?? null,
      contact: player.contact ?? null,
      address: player.address ?? null,
      wechatQr: player.wechatQr ?? null,
      alipayQr: player.alipayQr ?? null,
      depositBase: player.depositBase ?? null,
      depositLocked: player.depositLocked ?? null,
      creditMultiplier: player.creditMultiplier ?? null,
      status: player.status,
      notes: player.notes ?? null,
      createdAt: new Date(player.createdAt),
      updatedAt: player.updatedAt ? new Date(player.updatedAt) : null,
    },
  });
  return mapPlayer(row);
}

export async function updatePlayer(playerId: string, patch: Partial<AdminPlayer>) {
  try {
    const row = await prisma.adminPlayer.update({
      where: { id: playerId },
      data: {
        name: patch.name,
        role: patch.role ?? undefined,
        contact: patch.contact ?? undefined,
        address: patch.address ?? undefined,
        wechatQr: patch.wechatQr ?? undefined,
        alipayQr: patch.alipayQr ?? undefined,
        depositBase: patch.depositBase ?? undefined,
        depositLocked: patch.depositLocked ?? undefined,
        creditMultiplier: patch.creditMultiplier ?? undefined,
        notes: patch.notes ?? undefined,
        status: patch.status,
        updatedAt: new Date(),
      },
    });
    return mapPlayer(row);
  } catch {
    return null;
  }
}

export async function removePlayer(playerId: string) {
  try {
    await prisma.adminPlayer.delete({ where: { id: playerId } });
    return true;
  } catch {
    return false;
  }
}

export async function removePlayers(playerIds: string[]) {
  const ids = playerIds.filter(Boolean);
  if (ids.length === 0) return 0;
  const result = await prisma.adminPlayer.deleteMany({ where: { id: { in: ids } } });
  return result.count;
}

export async function listAnnouncements() {
  const rows = await prisma.adminAnnouncement.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(mapAnnouncement);
}

export async function addAnnouncement(announcement: AdminAnnouncement) {
  const row = await prisma.adminAnnouncement.create({
    data: {
      id: announcement.id,
      title: announcement.title,
      tag: announcement.tag,
      content: announcement.content,
      status: announcement.status,
      createdAt: new Date(announcement.createdAt),
      updatedAt: announcement.updatedAt ? new Date(announcement.updatedAt) : null,
    },
  });
  return mapAnnouncement(row);
}

export async function updateAnnouncement(announcementId: string, patch: Partial<AdminAnnouncement>) {
  try {
    const row = await prisma.adminAnnouncement.update({
      where: { id: announcementId },
      data: {
        title: patch.title,
        tag: patch.tag,
        content: patch.content,
        status: patch.status,
        updatedAt: new Date(),
      },
    });
    return mapAnnouncement(row);
  } catch {
    return null;
  }
}

export async function removeAnnouncement(announcementId: string) {
  try {
    await prisma.adminAnnouncement.delete({ where: { id: announcementId } });
    return true;
  } catch {
    return false;
  }
}

export async function removeAnnouncements(announcementIds: string[]) {
  const ids = announcementIds.filter(Boolean);
  if (ids.length === 0) return 0;
  const result = await prisma.adminAnnouncement.deleteMany({ where: { id: { in: ids } } });
  return result.count;
}

export async function listPublicAnnouncements() {
  if (process.env.NEXT_PUBLIC_VISUAL_TEST === "1" || process.env.VISUAL_TEST === "1") {
    return [];
  }
  const cacheKey = "public:announcements";
  const cached = getCache<AdminAnnouncement[]>(cacheKey);
  if (cached) {
    return cached.value;
  }
  const rows = await prisma.adminAnnouncement.findMany({
    where: { status: "published" },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  const items = rows.map(mapAnnouncement);
  setCache(cacheKey, items, 10_000);
  return items;
}

export async function querySupportTickets(params: { page: number; pageSize: number; status?: string; q?: string }) {
  const { page, pageSize, status, q } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminSupportTicketWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [
      { userName: { contains: keyword } },
      { contact: { contains: keyword } },
      { topic: { contains: keyword } },
      { message: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }
  const total = await prisma.adminSupportTicket.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.adminSupportTicket.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map(mapSupportTicket),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

export async function querySupportTicketsCursor(params: {
  pageSize: number;
  status?: string;
  q?: string;
  cursor?: CursorPayload;
}) {
  const { pageSize, status, q, cursor } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminSupportTicketWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [
      { userName: { contains: keyword } },
      { contact: { contains: keyword } },
      { topic: { contains: keyword } },
      { message: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }
  appendCursorWhere(where, cursor);
  const rows = await prisma.adminSupportTicket.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapSupportTicket),
    nextCursor: hasMore ? buildCursorPayload(sliced[sliced.length - 1]) : null,
  };
}

export async function addSupportTicket(ticket: AdminSupportTicket) {
  const row = await prisma.adminSupportTicket.create({
    data: {
      id: ticket.id,
      userName: ticket.userName ?? null,
      userAddress: ticket.userAddress ?? null,
      contact: ticket.contact ?? null,
      topic: ticket.topic ?? null,
      message: ticket.message,
      status: ticket.status,
      note: ticket.note ?? null,
      meta: ticket.meta ? (ticket.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      createdAt: new Date(ticket.createdAt),
      updatedAt: ticket.updatedAt ? new Date(ticket.updatedAt) : null,
    },
  });
  return mapSupportTicket(row);
}

export async function updateSupportTicket(ticketId: string, patch: Partial<AdminSupportTicket>) {
  try {
    const row = await prisma.adminSupportTicket.update({
      where: { id: ticketId },
      data: {
        status: patch.status,
        note: patch.note,
        meta: patch.meta ? (patch.meta as Prisma.InputJsonValue) : undefined,
        updatedAt: new Date(),
      },
    });
    return mapSupportTicket(row);
  } catch {
    return null;
  }
}

export async function removeSupportTicket(ticketId: string) {
  try {
    await prisma.adminSupportTicket.delete({ where: { id: ticketId } });
    return true;
  } catch {
    return false;
  }
}

export async function queryCoupons(params: { page: number; pageSize: number; status?: string; q?: string }) {
  const { page, pageSize, status, q } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminCouponWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [{ title: { contains: keyword } }, { code: { contains: keyword } }];
  }
  const total = await prisma.adminCoupon.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.adminCoupon.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map(mapCoupon),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

export async function queryCouponsCursor(params: {
  pageSize: number;
  status?: string;
  q?: string;
  cursor?: CursorPayload;
}) {
  const { pageSize, status, q, cursor } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminCouponWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [{ title: { contains: keyword } }, { code: { contains: keyword } }, { id: { contains: keyword } }];
  }
  appendCursorWhere(where, cursor);
  const rows = await prisma.adminCoupon.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapCoupon),
    nextCursor: hasMore ? buildCursorPayload(sliced[sliced.length - 1]) : null,
  };
}

export async function listActiveCoupons() {
  const now = new Date();
  const rows = await prisma.adminCoupon.findMany({
    where: {
      status: "可用",
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapCoupon);
}

export async function addCoupon(coupon: AdminCoupon) {
  const row = await prisma.adminCoupon.create({
    data: {
      id: coupon.id,
      title: coupon.title,
      code: coupon.code ?? null,
      description: coupon.description ?? null,
      discount: coupon.discount ?? null,
      minSpend: coupon.minSpend ?? null,
      status: coupon.status,
      startsAt: coupon.startsAt ? new Date(coupon.startsAt) : null,
      expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt) : null,
      createdAt: new Date(coupon.createdAt),
      updatedAt: coupon.updatedAt ? new Date(coupon.updatedAt) : null,
    },
  });
  return mapCoupon(row);
}

export async function updateCoupon(couponId: string, patch: Partial<AdminCoupon>) {
  try {
    const row = await prisma.adminCoupon.update({
      where: { id: couponId },
      data: {
        title: patch.title,
        code: patch.code,
        description: patch.description,
        discount:
          typeof patch.discount === "number" ? patch.discount : patch.discount === null ? null : undefined,
        minSpend:
          typeof patch.minSpend === "number" ? patch.minSpend : patch.minSpend === null ? null : undefined,
        status: patch.status,
        startsAt: patch.startsAt ? new Date(patch.startsAt) : patch.startsAt === null ? null : undefined,
        expiresAt: patch.expiresAt ? new Date(patch.expiresAt) : patch.expiresAt === null ? null : undefined,
        updatedAt: new Date(),
      },
    });
    return mapCoupon(row);
  } catch {
    return null;
  }
}

export async function removeCoupon(couponId: string) {
  try {
    await prisma.adminCoupon.delete({ where: { id: couponId } });
    return true;
  } catch {
    return false;
  }
}

export async function queryInvoiceRequests(params: { page: number; pageSize: number; status?: string; q?: string }) {
  const { page, pageSize, status, q } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminInvoiceRequestWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [
      { user: { contains: keyword } },
      { contact: { contains: keyword } },
      { email: { contains: keyword } },
      { orderId: { contains: keyword } },
      { title: { contains: keyword } },
      { taxId: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }
  const total = await prisma.adminInvoiceRequest.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.adminInvoiceRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map(mapInvoiceRequest),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

export async function queryInvoiceRequestsCursor(params: {
  pageSize: number;
  status?: string;
  q?: string;
  cursor?: CursorPayload;
}) {
  const { pageSize, status, q, cursor } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminInvoiceRequestWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [
      { title: { contains: keyword } },
      { taxId: { contains: keyword } },
      { orderId: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }
  appendCursorWhere(where, cursor);
  const rows = await prisma.adminInvoiceRequest.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapInvoiceRequest),
    nextCursor: hasMore ? buildCursorPayload(sliced[sliced.length - 1]) : null,
  };
}

export async function addInvoiceRequest(request: AdminInvoiceRequest) {
  const row = await prisma.adminInvoiceRequest.create({
    data: {
      id: request.id,
      user: request.user ?? null,
      userAddress: request.userAddress ?? null,
      contact: request.contact ?? null,
      email: request.email ?? null,
      orderId: request.orderId ?? null,
      amount: request.amount ?? null,
      title: request.title ?? null,
      taxId: request.taxId ?? null,
      address: request.address ?? null,
      status: request.status,
      note: request.note ?? null,
      meta: request.meta ? (request.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      createdAt: new Date(request.createdAt),
      updatedAt: request.updatedAt ? new Date(request.updatedAt) : null,
    },
  });
  return mapInvoiceRequest(row);
}

export async function updateInvoiceRequest(requestId: string, patch: Partial<AdminInvoiceRequest>) {
  try {
    const row = await prisma.adminInvoiceRequest.update({
      where: { id: requestId },
      data: {
        status: patch.status,
        note: patch.note,
        updatedAt: new Date(),
      },
    });
    return mapInvoiceRequest(row);
  } catch {
    return null;
  }
}

export async function removeInvoiceRequest(requestId: string) {
  try {
    await prisma.adminInvoiceRequest.delete({ where: { id: requestId } });
    return true;
  } catch {
    return false;
  }
}

export async function queryGuardianApplications(params: { page: number; pageSize: number; status?: string; q?: string }) {
  const { page, pageSize, status, q } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminGuardianApplicationWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [
      { user: { contains: keyword } },
      { contact: { contains: keyword } },
      { games: { contains: keyword } },
      { experience: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }
  const total = await prisma.adminGuardianApplication.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.adminGuardianApplication.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map(mapGuardianApplication),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

export async function queryGuardianApplicationsCursor(params: {
  pageSize: number;
  status?: string;
  q?: string;
  cursor?: CursorPayload;
}) {
  const { pageSize, status, q, cursor } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminGuardianApplicationWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [
      { user: { contains: keyword } },
      { games: { contains: keyword } },
      { contact: { contains: keyword } },
      { experience: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }
  appendCursorWhere(where, cursor);
  const rows = await prisma.adminGuardianApplication.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapGuardianApplication),
    nextCursor: hasMore ? buildCursorPayload(sliced[sliced.length - 1]) : null,
  };
}

export async function isApprovedGuardianAddress(address: string) {
  if (!address) return false;
  const row = await prisma.adminGuardianApplication.findFirst({
    where: { userAddress: { equals: address, mode: "insensitive" }, status: "已通过" },
    select: { id: true },
  });
  return Boolean(row);
}

export async function addGuardianApplication(application: AdminGuardianApplication) {
  const row = await prisma.adminGuardianApplication.create({
    data: {
      id: application.id,
      user: application.user ?? null,
      userAddress: application.userAddress ?? null,
      contact: application.contact ?? null,
      games: application.games ?? null,
      experience: application.experience ?? null,
      availability: application.availability ?? null,
      status: application.status,
      note: application.note ?? null,
      meta: application.meta ? (application.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      createdAt: new Date(application.createdAt),
      updatedAt: application.updatedAt ? new Date(application.updatedAt) : null,
    },
  });
  return mapGuardianApplication(row);
}

export async function updateGuardianApplication(applicationId: string, patch: Partial<AdminGuardianApplication>) {
  try {
    const row = await prisma.adminGuardianApplication.update({
      where: { id: applicationId },
      data: {
        status: patch.status,
        note: patch.note,
        updatedAt: new Date(),
      },
    });
    return mapGuardianApplication(row);
  } catch {
    return null;
  }
}

export async function removeGuardianApplication(applicationId: string) {
  try {
    await prisma.adminGuardianApplication.delete({ where: { id: applicationId } });
    return true;
  } catch {
    return false;
  }
}

export async function queryMembershipTiers(params: { page: number; pageSize: number; status?: string; q?: string }) {
  const { page, pageSize, status, q } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminMembershipTierWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [{ name: { contains: keyword } }, { badge: { contains: keyword } }];
  }
  const total = await prisma.adminMembershipTier.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.adminMembershipTier.findMany({
    where,
    orderBy: { level: "asc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map(mapMembershipTier),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

export async function queryMembershipTiersCursor(params: {
  pageSize: number;
  status?: string;
  q?: string;
  cursor?: CursorPayload;
}) {
  const { pageSize, status, q, cursor } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminMembershipTierWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [{ name: { contains: keyword } }, { id: { contains: keyword } }];
  }
  appendCursorWhere(where, cursor);
  const rows = await prisma.adminMembershipTier.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapMembershipTier),
    nextCursor: hasMore ? buildCursorPayload(sliced[sliced.length - 1]) : null,
  };
}

export async function listActiveMembershipTiers() {
  if (process.env.NEXT_PUBLIC_VISUAL_TEST === "1" || process.env.VISUAL_TEST === "1") {
    return [];
  }
  const rows = await prisma.adminMembershipTier.findMany({
    where: { status: "上架" },
    orderBy: { level: "asc" },
  });
  return rows.map(mapMembershipTier);
}

export async function getMembershipTierById(tierId: string) {
  const row = await prisma.adminMembershipTier.findUnique({ where: { id: tierId } });
  return row ? mapMembershipTier(row) : null;
}

export async function addMembershipTier(tier: AdminMembershipTier) {
  const row = await prisma.adminMembershipTier.create({
    data: {
      id: tier.id,
      name: tier.name,
      level: tier.level,
      badge: tier.badge ?? null,
      price: tier.price ?? null,
      durationDays: tier.durationDays ?? null,
      minPoints: tier.minPoints ?? null,
      status: tier.status,
      perks: tier.perks ? (tier.perks as Prisma.InputJsonValue) : Prisma.DbNull,
      createdAt: new Date(tier.createdAt),
      updatedAt: tier.updatedAt ? new Date(tier.updatedAt) : null,
    },
  });
  return mapMembershipTier(row);
}

export async function updateMembershipTier(tierId: string, patch: Partial<AdminMembershipTier>) {
  try {
    const row = await prisma.adminMembershipTier.update({
      where: { id: tierId },
      data: {
        name: patch.name,
        level: typeof patch.level === "number" ? patch.level : undefined,
        badge: patch.badge,
        price: typeof patch.price === "number" ? patch.price : patch.price === null ? null : undefined,
        durationDays:
          typeof patch.durationDays === "number"
            ? patch.durationDays
            : patch.durationDays === null
              ? null
              : undefined,
        minPoints:
          typeof patch.minPoints === "number"
            ? patch.minPoints
            : patch.minPoints === null
              ? null
              : undefined,
        status: patch.status,
        perks: patch.perks ? (patch.perks as Prisma.InputJsonValue) : patch.perks === null ? Prisma.DbNull : undefined,
        updatedAt: new Date(),
      },
    });
    return mapMembershipTier(row);
  } catch {
    return null;
  }
}

export async function removeMembershipTier(tierId: string) {
  try {
    await prisma.adminMembershipTier.delete({ where: { id: tierId } });
    return true;
  } catch {
    return false;
  }
}

export async function queryMembers(params: { page: number; pageSize: number; status?: string; q?: string }) {
  const { page, pageSize, status, q } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminMemberWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [
      { userName: { contains: keyword } },
      { userAddress: { contains: keyword } },
      { tierName: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }
  const total = await prisma.adminMember.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.adminMember.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map(mapMember),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

export async function queryMembersCursor(params: {
  pageSize: number;
  status?: string;
  q?: string;
  cursor?: CursorPayload;
}) {
  const { pageSize, status, q, cursor } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminMemberWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [
      { userName: { contains: keyword } },
      { userAddress: { contains: keyword } },
      { tierName: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }
  appendCursorWhere(where, cursor);
  const rows = await prisma.adminMember.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapMember),
    nextCursor: hasMore ? buildCursorPayload(sliced[sliced.length - 1]) : null,
  };
}

export async function getMemberByAddress(userAddress: string) {
  if (process.env.NEXT_PUBLIC_VISUAL_TEST === "1" || process.env.VISUAL_TEST === "1") {
    return null;
  }
  const row = await prisma.adminMember.findFirst({ where: { userAddress } });
  return row ? mapMember(row) : null;
}

export async function addMember(member: AdminMember) {
  const row = await prisma.adminMember.create({
    data: {
      id: member.id,
      userAddress: member.userAddress ?? null,
      userName: member.userName ?? null,
      tierId: member.tierId ?? null,
      tierName: member.tierName ?? null,
      points: typeof member.points === "number" ? member.points : null,
      status: member.status,
      expiresAt: member.expiresAt ? new Date(member.expiresAt) : null,
      note: member.note ?? null,
      createdAt: new Date(member.createdAt),
      updatedAt: member.updatedAt ? new Date(member.updatedAt) : null,
    },
  });
  return mapMember(row);
}

export async function updateMember(memberId: string, patch: Partial<AdminMember>) {
  try {
    const row = await prisma.adminMember.update({
      where: { id: memberId },
      data: {
        tierId: patch.tierId,
        tierName: patch.tierName,
        points: typeof patch.points === "number" ? patch.points : patch.points === null ? null : undefined,
        status: patch.status,
        expiresAt:
          typeof patch.expiresAt === "number"
            ? new Date(patch.expiresAt)
            : patch.expiresAt === null
              ? null
              : undefined,
        note: patch.note,
        updatedAt: new Date(),
      },
    });
    return mapMember(row);
  } catch {
    return null;
  }
}

export async function removeMember(memberId: string) {
  try {
    await prisma.adminMember.delete({ where: { id: memberId } });
    return true;
  } catch {
    return false;
  }
}

export async function queryMembershipRequests(params: { page: number; pageSize: number; status?: string; q?: string }) {
  const { page, pageSize, status, q } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminMembershipRequestWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [
      { userName: { contains: keyword } },
      { contact: { contains: keyword } },
      { tierName: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }
  const total = await prisma.adminMembershipRequest.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.adminMembershipRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map(mapMembershipRequest),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

export async function queryMembershipRequestsCursor(params: {
  pageSize: number;
  status?: string;
  q?: string;
  cursor?: CursorPayload;
}) {
  const { pageSize, status, q, cursor } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminMembershipRequestWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [
      { userName: { contains: keyword } },
      { userAddress: { contains: keyword } },
      { tierName: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }
  appendCursorWhere(where, cursor);
  const rows = await prisma.adminMembershipRequest.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapMembershipRequest),
    nextCursor: hasMore ? buildCursorPayload(sliced[sliced.length - 1]) : null,
  };
}

export async function addMembershipRequest(request: AdminMembershipRequest) {
  const row = await prisma.adminMembershipRequest.create({
    data: {
      id: request.id,
      userAddress: request.userAddress ?? null,
      userName: request.userName ?? null,
      contact: request.contact ?? null,
      tierId: request.tierId ?? null,
      tierName: request.tierName ?? null,
      status: request.status,
      note: request.note ?? null,
      meta: request.meta ? (request.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      createdAt: new Date(request.createdAt),
      updatedAt: request.updatedAt ? new Date(request.updatedAt) : null,
    },
  });
  return mapMembershipRequest(row);
}

export async function updateMembershipRequest(requestId: string, patch: Partial<AdminMembershipRequest>) {
  try {
    const row = await prisma.adminMembershipRequest.update({
      where: { id: requestId },
      data: {
        status: patch.status,
        note: patch.note,
        meta: patch.meta ? (patch.meta as Prisma.InputJsonValue) : undefined,
        updatedAt: new Date(),
      },
    });
    return mapMembershipRequest(row);
  } catch {
    return null;
  }
}

export async function removeMembershipRequest(requestId: string) {
  try {
    await prisma.adminMembershipRequest.delete({ where: { id: requestId } });
    return true;
  } catch {
    return false;
  }
}

export async function getAdminStats() {
  const [totalOrders, pendingOrders, activePlayers, publishedAnnouncements] = await Promise.all([
    prisma.adminOrder.count(),
    prisma.adminOrder.count({
      where: { stage: { notIn: ["已完成", "已取消"] } },
    }),
    prisma.adminPlayer.count({ where: { status: { not: "停用" } } }),
    prisma.adminAnnouncement.count({ where: { status: "published" } }),
  ]);
  return {
    totalOrders,
    pendingOrders,
    activePlayers,
    publishedAnnouncements,
  };
}

export async function addAuditLog(entry: AdminAuditLog) {
  const row = await prisma.adminAuditLog.create({
    data: {
      id: entry.id,
      actorRole: entry.actorRole,
      actorSessionId: entry.actorSessionId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      meta: entry.meta ? (entry.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      ip: entry.ip ?? null,
      createdAt: new Date(entry.createdAt),
    },
  });
  if (MAX_AUDIT_LOGS > 0) {
    const total = await prisma.adminAuditLog.count();
    const excess = total - MAX_AUDIT_LOGS;
    if (excess > 0) {
      const oldRows = await prisma.adminAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        skip: MAX_AUDIT_LOGS,
        take: excess,
        select: { id: true },
      });
      if (oldRows.length) {
        await prisma.adminAuditLog.deleteMany({
          where: { id: { in: oldRows.map((item) => item.id) } },
        });
      }
    }
  }
  return mapAudit(row);
}

export async function queryAuditLogs(params: { page: number; pageSize: number; q?: string }) {
  const { page, pageSize, q } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminAuditLogWhereInput = {};
  if (keyword) {
    where.OR = [
      { action: { contains: keyword } },
      { targetId: { contains: keyword } },
      { targetType: { contains: keyword } },
    ];
  }

  const total = await prisma.adminAuditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.adminAuditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });

  return {
    items: rows.map(mapAudit),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

export async function queryAuditLogsCursor(params: { pageSize: number; q?: string; cursor?: CursorPayload }) {
  const { pageSize, q, cursor } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminAuditLogWhereInput = {};
  if (keyword) {
    where.OR = [
      { action: { contains: keyword } },
      { targetId: { contains: keyword } },
      { targetType: { contains: keyword } },
      { actorRole: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }
  appendCursorWhere(where, cursor);
  const rows = await prisma.adminAuditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapAudit),
    nextCursor: hasMore ? buildCursorPayload(sliced[sliced.length - 1]) : null,
  };
}

export async function addPaymentEvent(entry: AdminPaymentEvent) {
  const row = await prisma.adminPaymentEvent.create({
    data: {
      id: entry.id,
      provider: entry.provider,
      event: entry.event,
      orderNo: entry.orderNo ?? null,
      amount: entry.amount ?? null,
      status: entry.status ?? null,
      verified: entry.verified,
      createdAt: new Date(entry.createdAt),
      raw: entry.raw ? (entry.raw as Prisma.InputJsonValue) : Prisma.DbNull,
    },
  });
  if (MAX_PAYMENT_EVENTS > 0) {
    const total = await prisma.adminPaymentEvent.count();
    const excess = total - MAX_PAYMENT_EVENTS;
    if (excess > 0) {
      const oldRows = await prisma.adminPaymentEvent.findMany({
        orderBy: { createdAt: "desc" },
        skip: MAX_PAYMENT_EVENTS,
        take: excess,
        select: { id: true },
      });
      if (oldRows.length) {
        await prisma.adminPaymentEvent.deleteMany({
          where: { id: { in: oldRows.map((item) => item.id) } },
        });
      }
    }
  }
  return mapPayment(row);
}

type LedgerRecordInput = Omit<LedgerRecord, "createdAt" | "updatedAt"> & { createdAt?: number };

export async function upsertLedgerRecord(entry: LedgerRecordInput) {
  const now = Date.now();
  const createdAt = new Date(entry.createdAt ?? now);
  const updateData: Prisma.LedgerRecordUpdateInput = {
    userAddress: entry.userAddress,
    diamondAmount: entry.diamondAmount,
    status: entry.status,
    updatedAt: new Date(now),
  };
  if (entry.amount !== undefined) updateData.amount = entry.amount;
  if (entry.currency !== undefined) updateData.currency = entry.currency;
  if (entry.channel !== undefined) updateData.channel = entry.channel;
  if (entry.orderId !== undefined) updateData.orderId = entry.orderId;
  if (entry.receiptId !== undefined) updateData.receiptId = entry.receiptId;
  if (entry.source !== undefined) updateData.source = entry.source;
  if (entry.note !== undefined) updateData.note = entry.note;
  if (entry.meta !== undefined) {
    updateData.meta = entry.meta ? (entry.meta as Prisma.InputJsonValue) : Prisma.DbNull;
  }

  const row = await prisma.ledgerRecord.upsert({
    where: { id: entry.id },
    create: {
      id: entry.id,
      userAddress: entry.userAddress,
      diamondAmount: entry.diamondAmount,
      amount: entry.amount ?? null,
      currency: entry.currency ?? null,
      channel: entry.channel ?? null,
      status: entry.status,
      orderId: entry.orderId ?? null,
      receiptId: entry.receiptId ?? null,
      source: entry.source ?? null,
      note: entry.note ?? null,
      meta: entry.meta ? (entry.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      createdAt,
    },
    update: updateData,
  });
  return mapLedgerRecord(row);
}

export async function queryLedgerRecords(params: { page: number; pageSize: number; address: string }) {
  const { page, pageSize, address } = params;
  const total = await prisma.ledgerRecord.count({ where: { userAddress: address } });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.ledgerRecord.findMany({
    where: { userAddress: address },
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map(mapLedgerRecord),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

export async function queryPaymentEvents(params: { page: number; pageSize: number }) {
  const { page, pageSize } = params;
  const total = await prisma.adminPaymentEvent.count();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.adminPaymentEvent.findMany({
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });

  return {
    items: rows.map(mapPayment),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

export async function queryPaymentEventsCursor(params: { pageSize: number; cursor?: CursorPayload }) {
  const { pageSize, cursor } = params;
  const where: Prisma.AdminPaymentEventWhereInput = {};
  appendCursorWhere(where, cursor);
  const rows = await prisma.adminPaymentEvent.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapPayment),
    nextCursor: hasMore ? buildCursorPayload(sliced[sliced.length - 1]) : null,
  };
}

export async function createSession(session: AdminSession) {
  const row = await prisma.adminSession.create({
    data: {
      id: session.id,
      tokenHash: session.tokenHash,
      role: session.role,
      label: session.label ?? null,
      createdAt: new Date(session.createdAt),
      expiresAt: new Date(session.expiresAt),
      lastSeenAt: session.lastSeenAt ? new Date(session.lastSeenAt) : null,
      ip: session.ip ?? null,
      userAgent: session.userAgent ?? null,
    },
  });
  return mapSession(row);
}

export async function getSessionByHash(tokenHash: string) {
  const row = await prisma.adminSession.findUnique({ where: { tokenHash } });
  return row ? mapSession(row) : null;
}

export async function updateSessionByHash(tokenHash: string, patch: Partial<AdminSession>) {
  try {
    const row = await prisma.adminSession.update({
      where: { tokenHash },
      data: {
        role: patch.role,
        label: patch.label ?? undefined,
        lastSeenAt: patch.lastSeenAt ? new Date(patch.lastSeenAt) : new Date(),
        expiresAt: patch.expiresAt ? new Date(patch.expiresAt) : undefined,
        ip: patch.ip ?? undefined,
        userAgent: patch.userAgent ?? undefined,
      },
    });
    return mapSession(row);
  } catch {
    return null;
  }
}

export async function removeSessionByHash(tokenHash: string) {
  try {
    await prisma.adminSession.delete({ where: { tokenHash } });
    return true;
  } catch {
    return false;
  }
}

export async function listAccessTokens() {
  const rows = await prisma.adminAccessToken.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapAccessToken);
}

export async function getAccessTokenByHash(tokenHash: string) {
  try {
    const row = await prisma.adminAccessToken.findUnique({ where: { tokenHash } });
    return row ? mapAccessToken(row) : null;
  } catch {
    return null;
  }
}

export async function addAccessToken(token: AdminAccessToken) {
  const row = await prisma.adminAccessToken.create({
    data: {
      id: token.id,
      tokenHash: token.tokenHash,
      tokenPrefix: token.tokenPrefix,
      role: token.role,
      label: token.label ?? null,
      status: token.status,
      createdAt: new Date(token.createdAt),
      updatedAt: token.updatedAt ? new Date(token.updatedAt) : null,
      lastUsedAt: token.lastUsedAt ? new Date(token.lastUsedAt) : null,
    },
  });
  return mapAccessToken(row);
}

export async function updateAccessToken(tokenId: string, patch: Partial<AdminAccessToken>) {
  try {
    const row = await prisma.adminAccessToken.update({
      where: { id: tokenId },
      data: {
        role: patch.role,
        label: patch.label === "" ? null : patch.label ?? undefined,
        status: patch.status,
        updatedAt: new Date(),
        lastUsedAt: patch.lastUsedAt ? new Date(patch.lastUsedAt) : undefined,
      },
    });
    return mapAccessToken(row);
  } catch {
    return null;
  }
}

export async function touchAccessTokenByHash(tokenHash: string) {
  try {
    await prisma.adminAccessToken.update({
      where: { tokenHash },
      data: { lastUsedAt: new Date(), updatedAt: new Date() },
    });
    return true;
  } catch {
    return false;
  }
}

export async function removeAccessToken(tokenId: string) {
  try {
    await prisma.adminAccessToken.delete({ where: { id: tokenId } });
    return true;
  } catch {
    return false;
  }
}

export async function getMantouWallet(address: string) {
  const row = await prisma.mantouWallet.findUnique({ where: { address } });
  if (!row) {
    return {
      address,
      balance: 0,
      frozen: 0,
      createdAt: Date.now(),
    } satisfies MantouWallet;
  }
  return mapMantouWallet(row);
}

export async function creditMantou(params: { address: string; amount: number; orderId?: string; note?: string }) {
  const amount = Math.floor(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be positive integer");
  }
  return prisma.$transaction(async (tx) => {
    if (params.orderId) {
      const existing = await tx.mantouTransaction.findFirst({
        where: { orderId: params.orderId, type: "credit" },
      });
      if (existing) {
        const wallet = await tx.mantouWallet.findUnique({ where: { address: params.address } });
        return {
          wallet: wallet ? mapMantouWallet(wallet) : undefined,
          transaction: mapMantouTransaction(existing),
          duplicated: true,
        };
      }
    }
    const now = new Date();
    const wallet = await tx.mantouWallet.upsert({
      where: { address: params.address },
      create: { address: params.address, balance: amount, frozen: 0, createdAt: now },
      update: { balance: { increment: amount }, updatedAt: now },
    });
    const transaction = await tx.mantouTransaction.create({
      data: {
        id: `MT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        address: params.address,
        type: "credit",
        amount,
        orderId: params.orderId ?? null,
        note: params.note ?? null,
        createdAt: now,
      },
    });
    return { wallet: mapMantouWallet(wallet), transaction: mapMantouTransaction(transaction), duplicated: false };
  });
}

export async function requestMantouWithdraw(params: {
  address: string;
  amount: number;
  account?: string;
  note?: string;
}) {
  const amount = Math.floor(params.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be positive integer");
  }
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.mantouWallet.findUnique({ where: { address: params.address } });
    const balance = wallet?.balance ?? 0;
    const frozen = wallet?.frozen ?? 0;
    if (balance < amount) {
      throw new Error("余额不足");
    }
    const now = new Date();
    const nextWallet = await tx.mantouWallet.upsert({
      where: { address: params.address },
      create: {
        address: params.address,
        balance: balance - amount,
        frozen: frozen + amount,
        createdAt: now,
      },
      update: {
        balance: { decrement: amount },
        frozen: { increment: amount },
        updatedAt: now,
      },
    });
    const request = await tx.mantouWithdrawRequest.create({
      data: {
        id: `MW-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        address: params.address,
        amount,
        status: "待审核",
        note: params.note ?? null,
        account: params.account ?? null,
        createdAt: now,
      },
    });
    await tx.mantouTransaction.create({
      data: {
        id: `MT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        address: params.address,
        type: "withdraw_request",
        amount,
        orderId: null,
        note: params.note ?? null,
        createdAt: now,
      },
    });
    return { wallet: mapMantouWallet(nextWallet), request: mapMantouWithdraw(request) };
  });
}

export async function queryMantouWithdraws(params: {
  page: number;
  pageSize: number;
  status?: string;
  address?: string;
}) {
  const { page, pageSize, status, address } = params;
  const where: Prisma.MantouWithdrawRequestWhereInput = {};
  if (status) where.status = status;
  if (address) where.address = address;
  const total = await prisma.mantouWithdrawRequest.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.mantouWithdrawRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map(mapMantouWithdraw),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

export async function queryMantouWithdrawsCursor(params: {
  pageSize: number;
  status?: string;
  address?: string;
  cursor?: CursorPayload;
}) {
  const { pageSize, status, address, cursor } = params;
  const where: Prisma.MantouWithdrawRequestWhereInput = {};
  if (status && status !== "全部") where.status = status;
  if (address) where.address = address;
  appendCursorWhere(where, cursor);
  const rows = await prisma.mantouWithdrawRequest.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapMantouWithdraw),
    nextCursor: hasMore ? buildCursorPayload(sliced[sliced.length - 1]) : null,
  };
}

export async function updateMantouWithdrawStatus(params: {
  id: string;
  status: "已通过" | "已打款" | "已拒绝" | "已退回";
  note?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.mantouWithdrawRequest.findUnique({ where: { id: params.id } });
    if (!request) return null;
    if (request.status === params.status) {
      return mapMantouWithdraw(request);
    }
    const now = new Date();
    const wallet = await tx.mantouWallet.findUnique({ where: { address: request.address } });
    const frozen = wallet?.frozen ?? 0;
    if (frozen < request.amount) {
      throw new Error("冻结余额不足");
    }
    if (params.status === "已通过") {
      await tx.mantouTransaction.create({
        data: {
          id: `MT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          address: request.address,
          type: "withdraw_approved",
          amount: request.amount,
          orderId: null,
          note: params.note ?? null,
          createdAt: now,
        },
      });
    }
    if (params.status === "已打款") {
      await tx.mantouWallet.upsert({
        where: { address: request.address },
        create: {
          address: request.address,
          balance: 0,
          frozen: frozen - request.amount,
          createdAt: now,
        },
        update: { frozen: { decrement: request.amount }, updatedAt: now },
      });
      await tx.mantouTransaction.create({
        data: {
          id: `MT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          address: request.address,
          type: "withdraw_paid",
          amount: request.amount,
          orderId: null,
          note: params.note ?? null,
          createdAt: now,
        },
      });
    }
    if (params.status === "已拒绝" || params.status === "已退回") {
      await tx.mantouWallet.upsert({
        where: { address: request.address },
        create: {
          address: request.address,
          balance: request.amount,
          frozen: frozen - request.amount,
          createdAt: now,
        },
        update: {
          balance: { increment: request.amount },
          frozen: { decrement: request.amount },
          updatedAt: now,
        },
      });
      await tx.mantouTransaction.create({
        data: {
          id: `MT-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
          address: request.address,
          type: params.status === "已拒绝" ? "withdraw_rejected" : "withdraw_returned",
          amount: request.amount,
          orderId: null,
          note: params.note ?? null,
          createdAt: now,
        },
      });
    }
    const updated = await tx.mantouWithdrawRequest.update({
      where: { id: params.id },
      data: { status: params.status, note: params.note ?? request.note, updatedAt: now },
    });
    return mapMantouWithdraw(updated);
  });
}

export async function queryMantouTransactions(params: { page: number; pageSize: number; address: string }) {
  const { page, pageSize, address } = params;
  const total = await prisma.mantouTransaction.count({ where: { address } });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.mantouTransaction.findMany({
    where: { address },
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map(mapMantouTransaction),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}
