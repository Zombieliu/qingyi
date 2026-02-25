import { prisma, Prisma } from "./admin-store-utils";
import { notDeleted } from "@/lib/shared/soft-delete";

const CHAIN_ORDER_WHERE: Prisma.AdminOrderWhereInput = {
  ...notDeleted,
  OR: [{ chainDigest: { not: null } }, { chainStatus: { not: null } }, { source: "chain" }],
};

export async function listChainOrdersForAdmin(limit = 500) {
  const rows = await prisma.adminOrder.findMany({
    where: CHAIN_ORDER_WHERE,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, chainStatus: true, chainDigest: true, source: true, meta: true },
  });
  return rows.map((row) => ({
    id: row.id,
    chainStatus: row.chainStatus ?? undefined,
    chainDigest: row.chainDigest ?? undefined,
    source: row.source ?? undefined,
    meta: (row.meta as Record<string, unknown> | null) || undefined,
  }));
}

export async function listChainOrdersForAutoFinalize(limit = 500) {
  const rows = await prisma.adminOrder.findMany({
    where: CHAIN_ORDER_WHERE,
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, chainStatus: true, chainDigest: true, source: true, meta: true },
  });
  return rows.map((row) => ({
    id: row.id,
    chainStatus: row.chainStatus ?? undefined,
    chainDigest: row.chainDigest ?? undefined,
    source: row.source ?? undefined,
    meta: (row.meta as Record<string, unknown> | null) || undefined,
  }));
}

export async function listChainOrdersForCleanup(limit = 1000) {
  const rows = await prisma.adminOrder.findMany({
    where: { source: "chain", ...notDeleted },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, source: true, createdAt: true },
  });
  return rows.map((row) => ({
    id: row.id,
    source: row.source ?? undefined,
    createdAt: row.createdAt.getTime(),
  }));
}
