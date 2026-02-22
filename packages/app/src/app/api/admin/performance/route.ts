import { requireAdmin } from "@/lib/admin/admin-auth";
import { prisma } from "@/lib/db";
import { getCache, setCache, computeJsonEtag } from "@/lib/server-cache";
import { getIfNoneMatch, jsonWithEtag, notModified } from "@/lib/http-cache";

const CACHE_TTL_MS = 30_000;
const CACHE_CONTROL = "private, max-age=30, stale-while-revalidate=60";

/**
 * 陪练绩效 API
 *
 * GET /api/admin/performance?days=30
 *
 * 返回每个陪练的：
 * - 接单量、完成量、取消量、完成率
 * - 总营收、平均评分
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const days = Math.min(90, Math.max(1, Number(searchParams.get("days") || 30)));
  const cacheKey = `api:admin:performance:${days}`;

  const cached = getCache<unknown>(cacheKey);
  if (cached?.etag) {
    const ifNoneMatch = getIfNoneMatch(req);
    if (ifNoneMatch === cached.etag) return notModified(cached.etag, CACHE_CONTROL);
    return jsonWithEtag(cached.value, cached.etag, CACHE_CONTROL);
  }

  const since = new Date(Date.now() - days * 86400_000);

  const [orders, reviews, players] = await Promise.all([
    prisma.adminOrder.findMany({
      where: { createdAt: { gte: since }, assignedTo: { not: null } },
      select: {
        assignedTo: true,
        companionAddress: true,
        stage: true,
        amount: true,
        id: true,
      },
    }),
    prisma.orderReview.findMany({
      where: { createdAt: { gte: since } },
      select: { companionAddress: true, rating: true },
    }),
    prisma.adminPlayer.findMany({
      where: { status: { not: "停用" } },
      select: { id: true, name: true, address: true },
    }),
  ]);

  // Build player lookup
  const playerById = new Map(players.map((p) => [p.id, p]));
  const playerByAddr = new Map(
    players.map((p) => [p.address, p]).filter(([a]) => a) as [string, (typeof players)[0]][]
  );

  // Aggregate by companion
  type PerfEntry = {
    playerId: string;
    name: string;
    total: number;
    completed: number;
    cancelled: number;
    revenue: number;
    ratings: number[];
  };
  const perfMap = new Map<string, PerfEntry>();

  function getOrCreate(playerId: string, name: string): PerfEntry {
    let entry = perfMap.get(playerId);
    if (!entry) {
      entry = { playerId, name, total: 0, completed: 0, cancelled: 0, revenue: 0, ratings: [] };
      perfMap.set(playerId, entry);
    }
    return entry;
  }

  for (const o of orders) {
    const assignedId = o.assignedTo!;
    const player = playerById.get(assignedId);
    const entry = getOrCreate(assignedId, player?.name || assignedId);
    entry.total += 1;
    if (o.stage === "已完成") {
      entry.completed += 1;
      entry.revenue += o.amount;
    } else if (o.stage === "已取消") {
      entry.cancelled += 1;
    }
  }

  // Merge reviews
  for (const r of reviews) {
    const player = playerByAddr.get(r.companionAddress);
    if (player) {
      const entry = getOrCreate(player.id, player.name);
      entry.ratings.push(r.rating);
    }
  }

  const performance = Array.from(perfMap.values())
    .map((e) => ({
      playerId: e.playerId,
      name: e.name,
      total: e.total,
      completed: e.completed,
      cancelled: e.cancelled,
      completionRate: e.total > 0 ? Math.round((e.completed / e.total) * 1000) / 10 : 0,
      revenue: Math.round(e.revenue * 100) / 100,
      avgRating:
        e.ratings.length > 0
          ? Math.round((e.ratings.reduce((a, b) => a + b, 0) / e.ratings.length) * 10) / 10
          : null,
      reviewCount: e.ratings.length,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const payload = { rangeDays: days, performance };
  const etag = computeJsonEtag(payload);
  setCache(cacheKey, payload, CACHE_TTL_MS, etag);
  return jsonWithEtag(payload, etag, CACHE_CONTROL);
}
