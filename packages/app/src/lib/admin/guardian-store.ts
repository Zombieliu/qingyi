import type { AdminGuardianApplication } from "./admin-types";
import {
  prisma,
  Prisma,
  type CursorPayload,
  appendCursorWhere,
  buildCursorPayload,
} from "./admin-store-utils";

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

export async function queryGuardianApplications(params: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}) {
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

export async function updateGuardianApplication(
  applicationId: string,
  patch: Partial<AdminGuardianApplication>
) {
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
