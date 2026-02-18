import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { getCacheStats, clearCache, getChainOrderStats } from "@/lib/chain/chain-order-cache";
import { fetchChainOrdersCached } from "@/lib/chain/chain-sync";

/**
 * 链上订单缓存监控和管理 API
 *
 * GET /api/admin/chain/cache
 * - 查看缓存统计信息
 *
 * DELETE /api/admin/chain/cache
 * - 清空缓存，强制下次查询时刷新
 *
 * POST /api/admin/chain/cache/refresh
 * - 立即刷新缓存
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;

  const stats = getCacheStats();

  const response = {
    cache: {
      orderCount: stats.orderCount,
      cacheAgeMs: stats.cacheAgeMs,
      cacheAgeSec: stats.cacheAgeMs ? Math.round(stats.cacheAgeMs / 1000) : null,
      lastFetch: stats.lastFetch,
      lastFetchDate: stats.lastFetch ? new Date(stats.lastFetch).toISOString() : null,
      hits: stats.hits,
      misses: stats.misses,
      hitRate: stats.hits + stats.misses > 0 ? stats.hits / (stats.hits + stats.misses) : 0,
    },
    config: {
      cacheTtlMs: Number(process.env.CHAIN_ORDER_CACHE_TTL_MS || "30000"),
      cacheTtlSec: Math.round(Number(process.env.CHAIN_ORDER_CACHE_TTL_MS || "30000") / 1000),
      maxCacheAgeMs: Number(process.env.CHAIN_ORDER_MAX_CACHE_AGE_MS || "300000"),
      maxCacheAgeSec: Math.round(Number(process.env.CHAIN_ORDER_MAX_CACHE_AGE_MS || "300000") / 1000),
      eventLimit: Number(process.env.ADMIN_CHAIN_EVENT_LIMIT || process.env.NEXT_PUBLIC_QY_EVENT_LIMIT || "1000"),
    },
    status: stats.cacheAgeMs === null ? "empty" : stats.cacheAgeMs < 30000 ? "fresh" : stats.cacheAgeMs < 300000 ? "stale" : "expired",
  };

  return NextResponse.json(response);
}

export async function DELETE(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const beforeStats = getCacheStats();
  clearCache();
  const afterStats = getCacheStats();

  return NextResponse.json({
    message: "缓存已清空",
    before: beforeStats,
    after: afterStats,
    timestamp: new Date().toISOString(),
  });
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const start = Date.now();
  const orders = await fetchChainOrdersCached(true); // 强制刷新
  const duration = Date.now() - start;
  const stats = getCacheStats();

  const chainStats = await getChainOrderStats(false); // 不再次刷新，使用刚才的缓存

  return NextResponse.json({
    message: "缓存已刷新",
    refreshDuration: duration,
    orderCount: orders.length,
    cacheStats: stats,
    orderStats: {
      byStatus: chainStats.byStatus,
      newest: chainStats.newestOrder
        ? {
            orderId: chainStats.newestOrder.orderId,
            status: chainStats.newestOrder.status,
            createdAt: chainStats.newestOrder.createdAt,
          }
        : null,
      oldest: chainStats.oldestOrder
        ? {
            orderId: chainStats.oldestOrder.orderId,
            status: chainStats.oldestOrder.status,
            createdAt: chainStats.oldestOrder.createdAt,
          }
        : null,
    },
    timestamp: new Date().toISOString(),
  });
}
