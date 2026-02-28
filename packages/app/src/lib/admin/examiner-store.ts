import type { AdminExaminerApplication } from "./admin-types";
import {
  prisma,
  Prisma,
  type CursorPayload,
  appendCursorWhere,
  buildCursorPayload,
} from "./admin-store-utils";
import { notDeleted, softDelete } from "@/lib/shared/soft-delete";

function mapExaminerApplication(row: {
  id: string;
  user: string | null;
  userAddress: string | null;
  contact: string | null;
  games: string | null;
  rank: string | null;
  liveTime: string | null;
  status: string;
  note: string | null;
  meta: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date | null;
}): AdminExaminerApplication {
  return {
    id: row.id,
    user: row.user || undefined,
    userAddress: row.userAddress || undefined,
    contact: row.contact || undefined,
    games: row.games || undefined,
    rank: row.rank || undefined,
    liveTime: row.liveTime || undefined,
    status: row.status as AdminExaminerApplication["status"],
    note: row.note || undefined,
    meta: (row.meta as Record<string, unknown> | null) || undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

export async function queryExaminerApplications(params: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}) {
  const { page, pageSize, status, q } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminExaminerApplicationWhereInput = { ...notDeleted };
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [
      { user: { contains: keyword } },
      { contact: { contains: keyword } },
      { games: { contains: keyword } },
      { rank: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }
  const total = await prisma.adminExaminerApplication.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.adminExaminerApplication.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map(mapExaminerApplication),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

export async function queryExaminerApplicationsCursor(params: {
  pageSize: number;
  status?: string;
  q?: string;
  cursor?: CursorPayload;
}) {
  const { pageSize, status, q, cursor } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminExaminerApplicationWhereInput = { ...notDeleted };
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [
      { user: { contains: keyword } },
      { games: { contains: keyword } },
      { contact: { contains: keyword } },
      { rank: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }
  appendCursorWhere(where, cursor);
  const rows = await prisma.adminExaminerApplication.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapExaminerApplication),
    nextCursor: hasMore ? buildCursorPayload(sliced[sliced.length - 1]) : null,
  };
}

export async function addExaminerApplication(application: AdminExaminerApplication) {
  const row = await prisma.adminExaminerApplication.create({
    data: {
      id: application.id,
      user: application.user ?? null,
      userAddress: application.userAddress ?? null,
      contact: application.contact ?? null,
      games: application.games ?? null,
      rank: application.rank ?? null,
      liveTime: application.liveTime ?? null,
      status: application.status,
      note: application.note ?? null,
      meta: application.meta ? (application.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      createdAt: new Date(application.createdAt),
      updatedAt: application.updatedAt ? new Date(application.updatedAt) : null,
    },
  });
  return mapExaminerApplication(row);
}

export async function updateExaminerApplication(
  applicationId: string,
  patch: Partial<AdminExaminerApplication>
) {
  try {
    const row = await prisma.adminExaminerApplication.update({
      where: { id: applicationId },
      data: {
        status: patch.status,
        note: patch.note,
        updatedAt: new Date(),
      },
    });
    return mapExaminerApplication(row);
  } catch {
    return null;
  }
}

export async function removeExaminerApplication(applicationId: string) {
  try {
    await prisma.adminExaminerApplication.update({
      where: { id: applicationId },
      data: softDelete(),
    });
    return true;
  } catch {
    return false;
  }
}
