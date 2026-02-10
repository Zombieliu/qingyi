import "server-only";
import { fetchChainOrdersAdmin, type ChainOrder } from "./chain-admin";
import { chainOrderLogger } from "./chain-order-logger";

/**
 * 链上订单缓存系统
 *
 * 解决问题：
 * 1. 避免每次查询都从区块链获取所有订单（性能优化）
 * 2. 提供更快的单个订单查询
 * 3. 支持增量更新和智能缓存失效
 */

type CacheEntry = {
  orders: Map<string, ChainOrder>;
  allOrders: ChainOrder[];
  fetchedAt: number;
  orderCount: number;
};

type CacheStats = {
  hits: number;
  misses: number;
  lastFetch: number | null;
  orderCount: number;
  cacheAgeMs: number | null;
};

// 缓存配置
const CACHE_TTL_MS = Number(process.env.CHAIN_ORDER_CACHE_TTL_MS || "30000"); // 默认30秒
const MAX_CACHE_AGE_MS = Number(process.env.CHAIN_ORDER_MAX_CACHE_AGE_MS || "300000"); // 最大5分钟

let cache: CacheEntry | null = null;
let stats: CacheStats = {
  hits: 0,
  misses: 0,
  lastFetch: null,
  orderCount: 0,
  cacheAgeMs: null,
};

/**
 * 获取缓存统计信息
 */
export function getCacheStats(): CacheStats {
  return {
    ...stats,
    cacheAgeMs: cache ? Date.now() - cache.fetchedAt : null,
  };
}

/**
 * 清空缓存
 */
export function clearCache() {
  chainOrderLogger.info("clearCache", { orderCount: cache?.orderCount || 0 });
  cache = null;
  stats.hits = 0;
  stats.misses = 0;
  stats.lastFetch = null;
  stats.orderCount = 0;
  stats.cacheAgeMs = null;
}

/**
 * 检查缓存是否有效
 */
function isCacheValid(): boolean {
  if (!cache) return false;
  const age = Date.now() - cache.fetchedAt;
  return age < CACHE_TTL_MS;
}

/**
 * 检查缓存是否过期需要强制刷新
 */
function isCacheStale(): boolean {
  if (!cache) return true;
  const age = Date.now() - cache.fetchedAt;
  return age > MAX_CACHE_AGE_MS;
}

/**
 * 从区块链刷新缓存
 */
async function refreshCache(force = false): Promise<CacheEntry> {
  // 如果缓存有效且不是强制刷新，直接返回
  if (!force && isCacheValid()) {
    stats.hits++;
    chainOrderLogger.debug("refreshCache", { action: "cache_hit", orderCount: cache!.orderCount });
    return cache!;
  }

  stats.misses++;
  chainOrderLogger.info("refreshCache", { action: "fetching", force });

  const fetchStart = Date.now();

  try {
    const allOrders = await fetchChainOrdersAdmin();
    const orders = new Map<string, ChainOrder>();

    for (const order of allOrders) {
      orders.set(order.orderId, order);
    }

    cache = {
      orders,
      allOrders,
      fetchedAt: Date.now(),
      orderCount: allOrders.length,
    };

    stats.lastFetch = Date.now();
    stats.orderCount = allOrders.length;

    const duration = Date.now() - fetchStart;
    chainOrderLogger.info("refreshCache", {
      action: "completed",
      duration,
      orderCount: allOrders.length,
    });

    return cache;
  } catch (error) {
    const duration = Date.now() - fetchStart;
    chainOrderLogger.error("refreshCache", error, { duration });

    // 如果刷新失败但有旧缓存，返回旧缓存（降级策略）
    if (cache && !isCacheStale()) {
      chainOrderLogger.warn("refreshCache", {
        action: "fallback_to_stale_cache",
        cacheAge: Date.now() - cache.fetchedAt,
      });
      return cache;
    }
    throw error;
  }
}

/**
 * 获取所有链上订单（带缓存）
 */
export async function fetchChainOrdersCached(forceRefresh = false): Promise<ChainOrder[]> {
  const entry = await refreshCache(forceRefresh);
  return entry.allOrders;
}

/**
 * 查找单个链上订单（优化版）
 *
 * 性能对比：
 * - 旧方法：每次查询获取所有订单，O(n)时间复杂度
 * - 新方法：使用缓存 + Map，O(1)时间复杂度
 */
export async function findChainOrderCached(
  orderId: string,
  options: { forceRefresh?: boolean } = {}
): Promise<ChainOrder | null> {
  const { forceRefresh = false } = options;

  chainOrderLogger.debug("findChainOrderCached", { orderId, forceRefresh });

  const entry = await refreshCache(forceRefresh);
  const order = entry.orders.get(orderId);

  if (order) {
    chainOrderLogger.debug("findChainOrderCached", {
      orderId,
      result: "found",
      status: order.status,
    });
  } else {
    chainOrderLogger.warn("findChainOrderCached", {
      orderId,
      result: "not_found",
      totalOrders: entry.orderCount,
    });
  }

  return order || null;
}

/**
 * 批量查找链上订单
 */
export async function findChainOrdersBatch(
  orderIds: string[],
  options: { forceRefresh?: boolean } = {}
): Promise<Map<string, ChainOrder | null>> {
  const { forceRefresh = false } = options;
  const entry = await refreshCache(forceRefresh);
  const result = new Map<string, ChainOrder | null>();

  for (const orderId of orderIds) {
    result.set(orderId, entry.orders.get(orderId) || null);
  }

  return result;
}

/**
 * 检查订单是否存在（不返回完整订单数据）
 */
export async function chainOrderExists(
  orderId: string,
  options: { forceRefresh?: boolean } = {}
): Promise<boolean> {
  const { forceRefresh = false } = options;
  const entry = await refreshCache(forceRefresh);
  return entry.orders.has(orderId);
}

/**
 * 获取订单统计信息
 */
export async function getChainOrderStats(forceRefresh = false): Promise<{
  totalOrders: number;
  byStatus: Record<number, number>;
  recentOrders: ChainOrder[];
  oldestOrder: ChainOrder | null;
  newestOrder: ChainOrder | null;
}> {
  const entry = await refreshCache(forceRefresh);

  const byStatus: Record<number, number> = {};
  for (const order of entry.allOrders) {
    byStatus[order.status] = (byStatus[order.status] || 0) + 1;
  }

  return {
    totalOrders: entry.orderCount,
    byStatus,
    recentOrders: entry.allOrders.slice(0, 10),
    oldestOrder: entry.allOrders[entry.allOrders.length - 1] || null,
    newestOrder: entry.allOrders[0] || null,
  };
}
