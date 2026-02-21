import type { AdminInvoiceRequest } from "./admin-types";
import {
  prisma,
  Prisma,
  type CursorPayload,
  appendCursorWhere,
  buildCursorPayload,
} from "./admin-store-utils";

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

export async function queryInvoiceRequests(params: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}) {
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
