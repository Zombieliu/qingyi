import type { AdminSupportTicket } from "./admin-types";
import {
  prisma,
  Prisma,
  type CursorPayload,
  appendCursorWhere,
  buildCursorPayload,
} from "./admin-store-utils";

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

export async function querySupportTickets(params: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}) {
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
