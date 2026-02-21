import type { AdminCoupon } from "./admin-types";
import {
  prisma,
  Prisma,
  type CursorPayload,
  appendCursorWhere,
  buildCursorPayload,
} from "./admin-store-utils";

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

export async function queryCoupons(params: {
  page: number;
  pageSize: number;
  status?: string;
  q?: string;
}) {
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
    where.OR = [
      { title: { contains: keyword } },
      { code: { contains: keyword } },
      { id: { contains: keyword } },
    ];
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

export async function getCouponById(couponId: string) {
  const row = await prisma.adminCoupon.findUnique({ where: { id: couponId } });
  return row ? mapCoupon(row) : null;
}

export async function getCouponByCode(code: string) {
  const row = await prisma.adminCoupon.findFirst({
    where: { code: { equals: code, mode: "insensitive" } },
  });
  return row ? mapCoupon(row) : null;
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
          typeof patch.discount === "number"
            ? patch.discount
            : patch.discount === null
              ? null
              : undefined,
        minSpend:
          typeof patch.minSpend === "number"
            ? patch.minSpend
            : patch.minSpend === null
              ? null
              : undefined,
        status: patch.status,
        startsAt: patch.startsAt
          ? new Date(patch.startsAt)
          : patch.startsAt === null
            ? null
            : undefined,
        expiresAt: patch.expiresAt
          ? new Date(patch.expiresAt)
          : patch.expiresAt === null
            ? null
            : undefined,
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
