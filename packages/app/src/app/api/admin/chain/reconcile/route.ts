import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { fetchChainOrdersCached, getChainOrderCacheStats } from "@/lib/chain/chain-sync";
import { getChainOrderStats } from "@/lib/chain/chain-order-cache";
import { prisma } from "@/lib/db";
import { parseBody } from "@/lib/shared/api-validation";

/**
 * 链上订单对账和诊断 API
 *
 * GET /api/admin/chain/reconcile
 *
 * 功能：
 * 1. 比对链上订单和本地订单
 * 2. 识别不一致的订单
 * 3. 提供诊断信息
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";
  const detailed = url.searchParams.get("detailed") === "true";

  // 获取链上订单
  const chainOrders = await fetchChainOrdersCached(forceRefresh);
  const chainOrderMap = new Map(chainOrders.map((o) => [o.orderId, o]));

  // 获取本地订单（只获取链上来源的）
  const localOrders = await prisma.adminOrder.findMany({
    where: {
      OR: [{ source: "chain" }, { chainStatus: { not: null } }],
    },
    select: {
      id: true,
      chainStatus: true,
      stage: true,
      paymentStatus: true,
      source: true,
      userAddress: true,
      companionAddress: true,
      serviceFee: true,
      deposit: true,
      createdAt: true,
    },
  });

  type LocalOrderType = (typeof localOrders)[number];

  const localOrderMap = new Map<string, LocalOrderType>(localOrders.map((o) => [o.id, o]));

  // 分类订单
  const missingInLocal: string[] = []; // 链上有，本地没有
  const missingInChain: string[] = []; // 本地有（source=chain），链上没有
  const statusMismatch: Array<{
    orderId: string;
    chainStatus: number;
    localStatus: number | null;
  }> = []; // 状态不一致
  const needsSync: Array<{
    orderId: string;
    reason: string;
  }> = []; // 需要同步

  // 检查链上订单
  for (const chainOrder of chainOrders) {
    const localOrder = localOrderMap.get(chainOrder.orderId);

    if (!localOrder) {
      missingInLocal.push(chainOrder.orderId);
      needsSync.push({
        orderId: chainOrder.orderId,
        reason: "链上订单未同步到本地",
      });
    } else if (chainOrder.status !== localOrder.chainStatus) {
      statusMismatch.push({
        orderId: chainOrder.orderId,
        chainStatus: chainOrder.status,
        localStatus: localOrder.chainStatus,
      });
      needsSync.push({
        orderId: chainOrder.orderId,
        reason: `状态不一致：链上=${chainOrder.status}，本地=${localOrder.chainStatus}`,
      });
    }
  }

  // 检查本地订单
  for (const localOrder of localOrders) {
    if (localOrder.source === "chain" && !chainOrderMap.has(localOrder.id)) {
      missingInChain.push(localOrder.id);
    }
  }

  // 获取统计信息
  const chainStats = await getChainOrderStats(forceRefresh);
  const cacheStats = getChainOrderCacheStats();

  const summary = {
    timestamp: new Date().toISOString(),
    chainOrders: {
      total: chainOrders.length,
      byStatus: chainStats.byStatus,
    },
    localOrders: {
      total: localOrders.length,
      bySource: localOrders.reduce(
        (acc: Record<string, number>, o: LocalOrderType) => {
          const src = o.source || "unknown";
          acc[src] = (acc[src] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      ),
    },
    discrepancies: {
      missingInLocal: missingInLocal.length,
      missingInChain: missingInChain.length,
      statusMismatch: statusMismatch.length,
      needsSync: needsSync.length,
    },
    cache: {
      enabled: true,
      age: cacheStats.cacheAgeMs,
      hits: cacheStats.hits,
      misses: cacheStats.misses,
      lastFetch: cacheStats.lastFetch,
    },
    health: {
      status:
        missingInLocal.length === 0 && statusMismatch.length === 0 ? "healthy" : "needs_attention",
      issues: [] as string[],
    },
  };

  // 添加健康检查问题
  if (missingInLocal.length > 0) {
    summary.health.issues.push(`${missingInLocal.length} 个链上订单未同步到本地`);
  }
  if (missingInChain.length > 0) {
    summary.health.issues.push(`${missingInChain.length} 个本地订单在链上找不到`);
  }
  if (statusMismatch.length > 0) {
    summary.health.issues.push(`${statusMismatch.length} 个订单状态不一致`);
  }

  type ReconcileResponse = {
    summary: typeof summary;
    details?: {
      missingInLocal: string[];
      missingInChain: string[];
      statusMismatch: Array<{
        orderId: string;
        chainStatus: number;
        localStatus: number | null;
      }>;
      needsSync: Array<{
        orderId: string;
        reason: string;
      }>;
    };
  };

  const response: ReconcileResponse = { summary };

  // 如果请求详细信息，添加详细列表
  if (detailed) {
    response.details = {
      missingInLocal: missingInLocal.slice(0, 50),
      missingInChain: missingInChain.slice(0, 50),
      statusMismatch: statusMismatch.slice(0, 50),
      needsSync: needsSync.slice(0, 50),
    };
  }

  return NextResponse.json(response);
}

const postSchema = z.object({
  action: z.string().min(1),
});

/**
 * 执行订单同步修复
 *
 * POST /api/admin/chain/reconcile
 *
 * Body: { action: "sync_missing" | "sync_all" | "fix_status" }
 */
export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, postSchema);
  if (!parsed.success) return parsed.response;
  const { action } = parsed.data;

  // 这里可以实现自动修复逻辑
  // 例如：同步缺失的订单，修复状态不一致等

  return NextResponse.json({
    message: "同步修复功能待实现",
    action,
    timestamp: new Date().toISOString(),
  });
}
