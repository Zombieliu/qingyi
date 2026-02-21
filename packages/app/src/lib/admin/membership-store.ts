import type { AdminMembershipTier, AdminMember, AdminMembershipRequest } from "./admin-types";
import {
  prisma,
  Prisma,
  type CursorPayload,
  appendCursorWhere,
  buildCursorPayload,
} from "./admin-store-utils";

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

export async function queryMembershipTiers(params: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}) {
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
        price:
          typeof patch.price === "number" ? patch.price : patch.price === null ? null : undefined,
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
        perks: patch.perks
          ? (patch.perks as Prisma.InputJsonValue)
          : patch.perks === null
            ? Prisma.DbNull
            : undefined,
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

export async function queryMembers(params: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}) {
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
        points:
          typeof patch.points === "number"
            ? patch.points
            : patch.points === null
              ? null
              : undefined,
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

export async function queryMembershipRequests(params: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}) {
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

export async function updateMembershipRequest(
  requestId: string,
  patch: Partial<AdminMembershipRequest>
) {
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
