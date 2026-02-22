import { requireAdmin } from "@/lib/admin/admin-auth";
import { prisma } from "@/lib/db";
import { getCache, setCache, computeJsonEtag } from "@/lib/server-cache";
import { getIfNoneMatch, jsonWithEtag, notModified } from "@/lib/http-cache";
import { formatDateISO } from "@/lib/shared/date-utils";

const CACHE_TTL_MS = 10_000;
const CACHE_CONTROL = "private, max-age=10, stale-while-revalidate=30";

/**
 * 数据大屏 API — 聚合实时运营数据
 *
 * GET /api/admin/dashboard
 *
 * 返回：
 * - realtime: 今日实时数据（订单数、营收、活跃用户）
 * - trends: 7天趋势（订单、营收、用户）
 * - funnel: 转化漏斗（访问→下单→支付→完成）
 * - distribution: 订单状态分布
 * - topPlayers: 今日 TOP5 陪练
 * - hourly: 24小时订单分布
 * - comparison: 同比环比
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;

  const cacheKey = "api:admin:dashboard";
  const cached = getCache<unknown>(cacheKey);
  if (cached?.etag) {
    const ifNoneMatch = getIfNoneMatch(req);
    if (ifNoneMatch === cached.etag) return notModified(cached.etag, CACHE_CONTROL);
    return jsonWithEtag(cached.value, cached.etag, CACHE_CONTROL);
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86400_000);
  const weekAgo = new Date(now.getTime() - 7 * 86400_000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 86400_000);

  const [
    todayOrders,
    yesterdayOrders,
    weekOrders,
    prevWeekOrders,
    allPlayers,
    stageDistribution,
    todayEvents,
  ] = await Promise.all([
    prisma.adminOrder.findMany({
      where: { createdAt: { gte: todayStart } },
      select: {
        amount: true,
        stage: true,
        serviceFee: true,
        createdAt: true,
        assignedTo: true,
        userAddress: true,
      },
    }),
    prisma.adminOrder.findMany({
      where: { createdAt: { gte: yesterdayStart, lt: todayStart } },
      select: { amount: true, stage: true, serviceFee: true },
    }),
    prisma.adminOrder.findMany({
      where: { createdAt: { gte: weekAgo } },
      select: {
        amount: true,
        stage: true,
        serviceFee: true,
        createdAt: true,
        userAddress: true,
        assignedTo: true,
      },
    }),
    prisma.adminOrder.findMany({
      where: { createdAt: { gte: twoWeeksAgo, lt: weekAgo } },
      select: { amount: true, stage: true },
    }),
    prisma.adminPlayer.findMany({
      where: { status: { not: "停用" } },
      select: { id: true, name: true },
    }),
    prisma.adminOrder.groupBy({
      by: ["stage"],
      _count: true,
    }),
    prisma.growthEvent.findMany({
      where: { createdAt: { gte: todayStart } },
      select: { event: true, userAddress: true },
    }),
  ]);

  // ─── Realtime (today) ───
  const todayCompleted = todayOrders.filter((o) => o.stage === "已完成");
  const todayRevenue = todayCompleted.reduce((s, o) => s + o.amount, 0);
  const todayServiceFee = todayCompleted.reduce((s, o) => s + (o.serviceFee || 0), 0);
  const todayUsers = new Set(todayOrders.map((o) => o.userAddress).filter(Boolean)).size;

  const yesterdayCompleted = yesterdayOrders.filter((o) => o.stage === "已完成");
  const yesterdayRevenue = yesterdayCompleted.reduce((s, o) => s + o.amount, 0);

  // ─── 7-day trends ───
  const dailyMap = new Map<string, { orders: number; revenue: number; users: Set<string> }>();
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getTime() - (6 - i) * 86400_000);
    dailyMap.set(formatDateISO(d), { orders: 0, revenue: 0, users: new Set() });
  }
  for (const o of weekOrders) {
    const key = formatDateISO(o.createdAt);
    const bucket = dailyMap.get(key);
    if (bucket) {
      bucket.orders += 1;
      if (o.stage === "已完成") bucket.revenue += o.amount;
      if (o.userAddress) bucket.users.add(o.userAddress);
    }
  }
  const trends = Array.from(dailyMap.entries()).map(([date, d]) => ({
    date,
    orders: d.orders,
    revenue: Math.round(d.revenue * 100) / 100,
    users: d.users.size,
  }));

  // ─── Hourly distribution (today) ───
  const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, count: 0 }));
  for (const o of todayOrders) {
    const h = o.createdAt.getHours();
    hourly[h].count += 1;
  }

  // ─── Stage distribution ───
  const distribution = stageDistribution.map((s) => ({
    stage: s.stage,
    count: s._count,
  }));

  // ─── Top players today ───
  const playerOrderMap = new Map<string, { count: number; revenue: number }>();
  for (const o of todayOrders) {
    if (!o.assignedTo) continue;
    const entry = playerOrderMap.get(o.assignedTo) || { count: 0, revenue: 0 };
    entry.count += 1;
    if (o.stage === "已完成") entry.revenue += o.amount;
    playerOrderMap.set(o.assignedTo, entry);
  }
  const playerLookup = new Map(allPlayers.map((p) => [p.id, p.name]));
  const topPlayers = Array.from(playerOrderMap.entries())
    .map(([id, d]) => ({
      id,
      name: playerLookup.get(id) || id,
      orders: d.count,
      revenue: Math.round(d.revenue * 100) / 100,
    }))
    .sort((a, b) => b.orders - a.orders)
    .slice(0, 5);

  // ─── Conversion funnel ───
  const visitEvents = todayEvents.filter((e) => e.event === "page_view");
  const orderIntents = todayEvents.filter((e) => e.event === "order_intent");
  const orderCreated = todayEvents.filter((e) => e.event === "order_create_success");
  const funnel = [
    {
      step: "访问",
      count:
        new Set(visitEvents.map((e) => e.userAddress).filter(Boolean)).size || todayEvents.length,
    },
    {
      step: "下单意向",
      count: new Set(orderIntents.map((e) => e.userAddress).filter(Boolean)).size,
    },
    {
      step: "创建订单",
      count: new Set(orderCreated.map((e) => e.userAddress).filter(Boolean)).size,
    },
    { step: "完成订单", count: todayCompleted.length },
  ];

  // ─── Week-over-week comparison ───
  const thisWeekRevenue = weekOrders
    .filter((o) => o.stage === "已完成")
    .reduce((s, o) => s + o.amount, 0);
  const prevWeekRevenue = prevWeekOrders
    .filter((o) => o.stage === "已完成")
    .reduce((s, o) => s + o.amount, 0);
  const thisWeekOrders = weekOrders.length;
  const prevWeekOrderCount = prevWeekOrders.length;

  const comparison = {
    revenue: {
      current: Math.round(thisWeekRevenue * 100) / 100,
      previous: Math.round(prevWeekRevenue * 100) / 100,
      change:
        prevWeekRevenue > 0
          ? Math.round(((thisWeekRevenue - prevWeekRevenue) / prevWeekRevenue) * 1000) / 10
          : 0,
    },
    orders: {
      current: thisWeekOrders,
      previous: prevWeekOrderCount,
      change:
        prevWeekOrderCount > 0
          ? Math.round(((thisWeekOrders - prevWeekOrderCount) / prevWeekOrderCount) * 1000) / 10
          : 0,
    },
  };

  const payload = {
    timestamp: now.toISOString(),
    realtime: {
      todayOrders: todayOrders.length,
      todayRevenue: Math.round(todayRevenue * 100) / 100,
      todayServiceFee: Math.round(todayServiceFee * 100) / 100,
      todayUsers,
      todayCompleted: todayCompleted.length,
      yesterdayRevenue: Math.round(yesterdayRevenue * 100) / 100,
      revenueChange:
        yesterdayRevenue > 0
          ? Math.round(((todayRevenue - yesterdayRevenue) / yesterdayRevenue) * 1000) / 10
          : 0,
    },
    trends,
    hourly,
    distribution,
    topPlayers,
    funnel,
    comparison,
  };

  const etag = computeJsonEtag(payload);
  setCache(cacheKey, payload, CACHE_TTL_MS, etag);
  return jsonWithEtag(payload, etag, CACHE_CONTROL);
}
