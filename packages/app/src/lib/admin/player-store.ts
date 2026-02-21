import type { AdminPlayer } from "./admin-types";
import { prisma, Prisma } from "./admin-store-utils";

function mapPlayer(row: {
  id: string;
  name: string;
  role: string | null;
  contact: string | null;
  address: string | null;
  wechatQr: string | null;
  alipayQr: string | null;
  depositBase: number | null;
  depositLocked: number | null;
  creditMultiplier: number | null;
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
    address: row.address || undefined,
    wechatQr: row.wechatQr || undefined,
    alipayQr: row.alipayQr || undefined,
    depositBase: row.depositBase ?? undefined,
    depositLocked: row.depositLocked ?? undefined,
    creditMultiplier: row.creditMultiplier ?? undefined,
    status: row.status as AdminPlayer["status"],
    notes: row.notes || undefined,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

function normalizePlayerAddress(address: string) {
  return (address || "").trim();
}

export async function listPlayers() {
  const rows = await prisma.adminPlayer.findMany({ orderBy: { createdAt: "desc" } });
  const players = rows.map(mapPlayer);
  const activeOrders = await prisma.adminOrder.groupBy({
    by: ["assignedTo"],
    where: { stage: { notIn: ["已完成", "已取消"] }, assignedTo: { not: null } },
    _sum: { amount: true },
  });
  const exposure = new Map<string, number>();
  for (const order of activeOrders) {
    const key = (order.assignedTo || "").trim();
    if (!key) continue;
    exposure.set(key, Number(order._sum.amount || 0));
  }

  const { DIAMOND_RATE } = await import("@/lib/shared/constants");
  return players.map((player) => {
    const keys = [player.id, player.name].filter(Boolean) as string[];
    const used = keys.reduce((sum, key) => sum + (exposure.get(key) || 0), 0);
    const depositBase = player.depositBase ?? 0;
    const multiplier = Math.min(5, Math.max(1, player.creditMultiplier ?? 1));
    const creditLimit = Number(((depositBase / DIAMOND_RATE) * multiplier).toFixed(2));
    const available = Number(Math.max(creditLimit - used, 0).toFixed(2));
    return {
      ...player,
      creditMultiplier: multiplier,
      creditLimit,
      usedCredit: Number(used.toFixed(2)),
      availableCredit: available,
    };
  });
}

export async function getPlayerById(playerId: string) {
  if (!playerId) return null;
  const row = await prisma.adminPlayer.findUnique({ where: { id: playerId } });
  return row ? mapPlayer(row) : null;
}

export async function getCompanionEarnings(params?: {
  from?: number;
  to?: number;
  limit?: number;
}) {
  const where: Prisma.AdminOrderWhereInput = {
    stage: "已完成",
    companionAddress: { not: null },
  };
  if (params?.from || params?.to) {
    where.createdAt = {};
    if (params.from) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(params.from);
    if (params.to) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(params.to);
  }
  const limit = Math.min(200, Math.max(5, params?.limit ?? 50));
  const [grouped, totals] = await Promise.all([
    prisma.adminOrder.groupBy({
      by: ["companionAddress"],
      where,
      _count: { id: true },
      _sum: { amount: true, serviceFee: true },
      _max: { createdAt: true },
      orderBy: {
        _sum: { serviceFee: "desc" },
      },
      take: limit,
    }),
    prisma.adminOrder.aggregate({
      where,
      _count: { id: true },
      _sum: { amount: true, serviceFee: true },
    }),
  ]);

  const addresses = grouped.map((row) => (row.companionAddress || "").trim()).filter(Boolean);
  const playerRows = addresses.length
    ? await prisma.adminPlayer.findMany({
        where: { address: { in: addresses } },
        select: { address: true, name: true },
      })
    : [];
  const playerNameMap = new Map(
    playerRows.map((row) => [normalizePlayerAddress(row.address || ""), row.name])
  );

  const items = grouped.map((row) => {
    const address = (row.companionAddress || "").trim();
    return {
      companionAddress: address,
      companionName: playerNameMap.get(normalizePlayerAddress(address)),
      orderCount: row._count.id ?? 0,
      totalAmount: Number(row._sum.amount ?? 0),
      totalServiceFee: Number(row._sum.serviceFee ?? 0),
      lastCompletedAt: row._max.createdAt ? row._max.createdAt.getTime() : null,
    };
  });

  return {
    totals: {
      orderCount: totals._count.id ?? 0,
      totalAmount: Number(totals._sum.amount ?? 0),
      totalServiceFee: Number(totals._sum.serviceFee ?? 0),
    },
    items,
  };
}

export async function listPlayersPublic() {
  const rows = await prisma.adminPlayer.findMany({
    select: {
      id: true,
      name: true,
      role: true,
      status: true,
      depositBase: true,
      depositLocked: true,
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    role: row.role || undefined,
    status: row.status as AdminPlayer["status"],
    depositBase: row.depositBase ?? undefined,
    depositLocked: row.depositLocked ?? undefined,
  }));
}

export async function getPlayerByAddress(address: string) {
  const normalized = normalizePlayerAddress(address);
  if (!normalized) return { player: null, conflict: false };
  const rows = await prisma.adminPlayer.findMany({
    where: { address: { equals: normalized, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: 2,
  });
  if (rows.length === 0) return { player: null, conflict: false };
  if (rows.length > 1) return { player: null, conflict: true };
  return { player: mapPlayer(rows[0]), conflict: false };
}

export async function updatePlayerStatusByAddress(address: string, status: AdminPlayer["status"]) {
  const normalized = normalizePlayerAddress(address);
  if (!normalized) return { player: null, conflict: false };
  const rows = await prisma.adminPlayer.findMany({
    where: { address: { equals: normalized, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: 2,
  });
  if (rows.length === 0) return { player: null, conflict: false };
  if (rows.length > 1) return { player: null, conflict: true };
  try {
    const row = await prisma.adminPlayer.update({
      where: { id: rows[0].id },
      data: { status, updatedAt: new Date() },
    });
    return { player: mapPlayer(row), conflict: false };
  } catch {
    return { player: null, conflict: false };
  }
}

export async function addPlayer(player: AdminPlayer) {
  const row = await prisma.adminPlayer.create({
    data: {
      id: player.id,
      name: player.name,
      role: player.role ?? null,
      contact: player.contact ?? null,
      address: player.address ?? null,
      wechatQr: player.wechatQr ?? null,
      alipayQr: player.alipayQr ?? null,
      depositBase: player.depositBase ?? null,
      depositLocked: player.depositLocked ?? null,
      creditMultiplier: player.creditMultiplier ?? null,
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
        address: patch.address ?? undefined,
        wechatQr: patch.wechatQr ?? undefined,
        alipayQr: patch.alipayQr ?? undefined,
        depositBase: patch.depositBase ?? undefined,
        depositLocked: patch.depositLocked ?? undefined,
        creditMultiplier: patch.creditMultiplier ?? undefined,
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

export async function removePlayers(playerIds: string[]) {
  const ids = playerIds.filter(Boolean);
  if (ids.length === 0) return 0;
  const result = await prisma.adminPlayer.deleteMany({ where: { id: { in: ids } } });
  return result.count;
}
