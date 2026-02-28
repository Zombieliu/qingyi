import type { AdminLiveApplication } from "./admin-types";
import {
  prisma,
  Prisma,
  type CursorPayload,
  appendCursorWhere,
  buildCursorPayload,
} from "./admin-store-utils";
import { notDeleted, softDelete } from "@/lib/shared/soft-delete";

function mapLiveApplication(row: {
  id: string;
  user: string | null;
  userAddress: string | null;
  contact: string | null;
  platform: string | null;
  liveUrl: string | null;
  games: string | null;
  liveTime: string | null;
  status: string;
  note: string | null;
  meta: Prisma.JsonValue | null;
  createdAt: Date;
  updatedAt: Date | null;
}): AdminLiveApplication {
  return {
    id: row.id,
    user: row.user || undefined,
    userAddress: row.userAddress || undefined,
    contact: row.contact || undefined,
    platform: row.platform || undefined,
    liveUrl: row.liveUrl || undefined,
    games: row.games || undefined,
    liveTime: row.liveTime || undefined,
    status: row.status as AdminLiveApplication["status"],
    note: row.note || undefined,
    meta: (row.meta as Record<string, unknown> | null) || undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

export async function queryLiveApplications(params: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}) {
  const { page, pageSize, status, q } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminLiveApplicationWhereInput = { ...notDeleted };
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [
      { user: { contains: keyword } },
      { contact: { contains: keyword } },
      { platform: { contains: keyword } },
      { liveUrl: { contains: keyword } },
      { games: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }
  const total = await prisma.adminLiveApplication.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(Math.max(page, 1), totalPages);
  const rows = await prisma.adminLiveApplication.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (clampedPage - 1) * pageSize,
    take: pageSize,
  });
  return {
    items: rows.map(mapLiveApplication),
    total,
    page: clampedPage,
    pageSize,
    totalPages,
  };
}

export async function queryLiveApplicationsCursor(params: {
  pageSize: number;
  status?: string;
  q?: string;
  cursor?: CursorPayload;
}) {
  const { pageSize, status, q, cursor } = params;
  const keyword = (q || "").trim();
  const where: Prisma.AdminLiveApplicationWhereInput = { ...notDeleted };
  if (status && status !== "全部") where.status = status;
  if (keyword) {
    where.OR = [
      { user: { contains: keyword } },
      { contact: { contains: keyword } },
      { platform: { contains: keyword } },
      { liveUrl: { contains: keyword } },
      { games: { contains: keyword } },
      { id: { contains: keyword } },
    ];
  }
  appendCursorWhere(where, cursor);
  const rows = await prisma.adminLiveApplication.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: pageSize + 1,
  });
  const hasMore = rows.length > pageSize;
  const sliced = hasMore ? rows.slice(0, pageSize) : rows;
  return {
    items: sliced.map(mapLiveApplication),
    nextCursor: hasMore ? buildCursorPayload(sliced[sliced.length - 1]) : null,
  };
}

export async function addLiveApplication(application: AdminLiveApplication) {
  const row = await prisma.adminLiveApplication.create({
    data: {
      id: application.id,
      user: application.user ?? null,
      userAddress: application.userAddress ?? null,
      contact: application.contact ?? null,
      platform: application.platform ?? null,
      liveUrl: application.liveUrl ?? null,
      games: application.games ?? null,
      liveTime: application.liveTime ?? null,
      status: application.status,
      note: application.note ?? null,
      meta: application.meta ? (application.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      createdAt: new Date(application.createdAt),
      updatedAt: application.updatedAt ? new Date(application.updatedAt) : null,
    },
  });
  return mapLiveApplication(row);
}

export async function updateLiveApplication(
  applicationId: string,
  patch: Partial<AdminLiveApplication>
) {
  try {
    const row = await prisma.adminLiveApplication.update({
      where: { id: applicationId },
      data: {
        status: patch.status,
        note: patch.note,
        updatedAt: new Date(),
      },
    });
    return mapLiveApplication(row);
  } catch {
    return null;
  }
}

export async function removeLiveApplication(applicationId: string) {
  try {
    await prisma.adminLiveApplication.update({
      where: { id: applicationId },
      data: softDelete(),
    });
    return true;
  } catch {
    return false;
  }
}
