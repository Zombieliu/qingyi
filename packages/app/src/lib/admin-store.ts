import "server-only";
import type {
  AdminAnnouncement,
  AdminAuditLog,
  AdminOrder,
  AdminPaymentEvent,
  AdminPlayer,
  AdminSession,
} from "./admin-types";
import { prisma } from "./db";
import { Prisma } from "@prisma/client";

const MAX_AUDIT_LOGS = Number(process.env.ADMIN_AUDIT_LOG_LIMIT || "1000");
const MAX_PAYMENT_EVENTS = Number(process.env.ADMIN_PAYMENT_EVENT_LIMIT || "1000");

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

export async function listOrders() {
  const rows = await prisma.adminOrder.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(mapOrder);
}

export async function queryOrders(params: {
  page: number;
  pageSize: number;
  stage?: string;
  q?: string;
  paymentStatus?: string;
  assignedTo?: string;
  userAddress?: string;
}) {
  const { page, pageSize, stage, q, paymentStatus, assignedTo, userAddress } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminOrderWhereInput = {};

  if (stage && stage !== "全部") {
    where.stage = stage;
  }
  if (paymentStatus) {
    where.paymentStatus = paymentStatus;
  }
  if (assignedTo) {
    where.assignedTo = assignedTo;
  }
  if (userAddress) {
    where.userAddress = userAddress;
  }
  if (keyword) {
    where.OR = [
      { user: { contains: keyword } },
      { item: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }

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

export async function getOrderById(orderId: string) {
  const row = await prisma.adminOrder.findUnique({ where: { id: orderId } });
  return row ? mapOrder(row) : null;
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
    return mapOrder(row);
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
  return rows.map(mapPlayer);
}

export async function addPlayer(player: AdminPlayer) {
  const row = await prisma.adminPlayer.create({
    data: {
      id: player.id,
      name: player.name,
      role: player.role ?? null,
      contact: player.contact ?? null,
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

export async function listPublicAnnouncements() {
  const rows = await prisma.adminAnnouncement.findMany({
    where: { status: "published" },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(mapAnnouncement);
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
