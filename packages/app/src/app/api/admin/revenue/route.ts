import { requireAdmin } from "@/lib/admin/admin-auth";
import { prisma } from "@/lib/db";
import { getCache, setCache, computeJsonEtag } from "@/lib/server-cache";
import { getIfNoneMatch, jsonWithEtag, notModified } from "@/lib/http-cache";
import { formatDateISO } from "@/lib/shared/date-utils";

const CACHE_TTL_MS = 30_000;
const CACHE_CONTROL = "private, max-age=30, stale-while-revalidate=60";

/**
 * 营收报表 API
 *
 * GET /api/admin/revenue?days=30
 *
 * 返回：
 * - summary: 总营收、已完成订单数、平均客单价、退款金额
 * - daily: 每日营收趋势
 * - byItem: 按商品分类的营收
 * - bySource: 按来源分类的营收
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const days = Math.min(90, Math.max(1, Number(searchParams.get("days") || 30)));
  const cacheKey = `api:admin:revenue:${days}`;

  const cached = getCache<unknown>(cacheKey);
  if (cached?.etag) {
    const ifNoneMatch = getIfNoneMatch(req);
    if (ifNoneMatch === cached.etag) return notModified(cached.etag, CACHE_CONTROL);
    return jsonWithEtag(cached.value, cached.etag, CACHE_CONTROL);
  }

  const since = new Date(Date.now() - days * 86400_000);

  const orders = await prisma.adminOrder.findMany({
    where: { createdAt: { gte: since } },
    select: {
      amount: true,
      currency: true,
      stage: true,
      item: true,
      source: true,
      serviceFee: true,
      createdAt: true,
    },
  });

  // Summary
  const completed = orders.filter((o) => o.stage === "已完成");
  const cancelled = orders.filter((o) => o.stage === "已取消");
  const totalRevenue = completed.reduce((sum, o) => sum + o.amount, 0);
  const totalServiceFee = completed.reduce((sum, o) => sum + (o.serviceFee || 0), 0);
  const cancelledAmount = cancelled.reduce((sum, o) => sum + o.amount, 0);
  const avgOrderValue = completed.length > 0 ? totalRevenue / completed.length : 0;

  // Daily trend
  const dailyMap = new Map<string, { revenue: number; orders: number; serviceFee: number }>();
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.now() - (days - 1 - i) * 86400_000);
    dailyMap.set(formatDateISO(d), { revenue: 0, orders: 0, serviceFee: 0 });
  }
  for (const o of completed) {
    const key = formatDateISO(o.createdAt);
    const bucket = dailyMap.get(key);
    if (bucket) {
      bucket.revenue += o.amount;
      bucket.orders += 1;
      bucket.serviceFee += o.serviceFee || 0;
    }
  }
  const daily = Array.from(dailyMap.entries()).map(([date, d]) => ({
    date,
    revenue: Math.round(d.revenue * 100) / 100,
    orders: d.orders,
    serviceFee: Math.round(d.serviceFee * 100) / 100,
  }));

  // By item
  const itemMap = new Map<string, { revenue: number; count: number }>();
  for (const o of completed) {
    const entry = itemMap.get(o.item) || { revenue: 0, count: 0 };
    entry.revenue += o.amount;
    entry.count += 1;
    itemMap.set(o.item, entry);
  }
  const byItem = Array.from(itemMap.entries())
    .map(([item, d]) => ({ item, revenue: Math.round(d.revenue * 100) / 100, count: d.count }))
    .sort((a, b) => b.revenue - a.revenue);

  // By source
  const sourceMap = new Map<string, { revenue: number; count: number }>();
  for (const o of completed) {
    const src = o.source || "unknown";
    const entry = sourceMap.get(src) || { revenue: 0, count: 0 };
    entry.revenue += o.amount;
    entry.count += 1;
    sourceMap.set(src, entry);
  }
  const bySource = Array.from(sourceMap.entries())
    .map(([source, d]) => ({ source, revenue: Math.round(d.revenue * 100) / 100, count: d.count }))
    .sort((a, b) => b.revenue - a.revenue);

  const payload = {
    rangeDays: days,
    summary: {
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalServiceFee: Math.round(totalServiceFee * 100) / 100,
      completedOrders: completed.length,
      cancelledOrders: cancelled.length,
      cancelledAmount: Math.round(cancelledAmount * 100) / 100,
      avgOrderValue: Math.round(avgOrderValue * 100) / 100,
      totalOrders: orders.length,
    },
    daily,
    byItem,
    bySource,
  };

  const etag = computeJsonEtag(payload);
  setCache(cacheKey, payload, CACHE_TTL_MS, etag);
  return jsonWithEtag(payload, etag, CACHE_CONTROL);
}
