import type { AdminAuditLog, AdminPaymentEvent } from "./admin-types";
import {
  prisma,
  Prisma,
  type CursorPayload,
  appendCursorWhere,
  buildCursorPayload,
} from "./admin-store-utils";
import { env } from "@/lib/env";

const MAX_AUDIT_LOGS = env.ADMIN_AUDIT_LOG_LIMIT;
const MAX_PAYMENT_EVENTS = env.ADMIN_PAYMENT_EVENT_LIMIT;

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

export async function queryAuditLogsCursor(params: {
  pageSize: number;
  q?: string;
  cursor?: CursorPayload;
}) {
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

export async function queryPaymentEventsCursor(params: {
  pageSize: number;
  cursor?: CursorPayload;
}) {
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
