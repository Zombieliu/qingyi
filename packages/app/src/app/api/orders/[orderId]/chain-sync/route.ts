import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import {
  findChainOrder,
  findChainOrderDirect,
  findChainOrderFromDigest,
  upsertChainOrder,
  getChainOrderCacheStats,
  clearChainOrderCache,
} from "@/lib/chain/chain-sync";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { getOrderById, updateOrder } from "@/lib/admin/admin-store";
import { z } from "zod";
import { parseBodyRaw } from "@/lib/shared/api-validation";
import { apiBadRequest, apiUnauthorized, apiForbidden } from "@/lib/shared/api-response";
import { ChainMessages } from "@/lib/shared/messages";

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

type LocalOrderRecord = Awaited<ReturnType<typeof getOrderById>>;

function toChainAmount(value?: number | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return String(Math.round(value * 100));
}

function buildDigestFallback(orderId: string, order: LocalOrderRecord | null | undefined) {
  if (!order) return undefined;
  const chainMeta = (order.meta as { chain?: { ruleSetId?: string | number } } | undefined)?.chain;
  return {
    orderId,
    user: order.userAddress || undefined,
    companion: order.companionAddress || undefined,
    ruleSetId: chainMeta?.ruleSetId !== undefined ? String(chainMeta.ruleSetId) : undefined,
    serviceFee: toChainAmount(order.serviceFee),
    deposit: toChainAmount(order.deposit),
    createdAt: order.createdAt ? String(order.createdAt) : undefined,
  };
}

const chainSyncSchema = z.object({
  userAddress: z.string().optional(),
  digest: z.string().optional(),
});

/**
 * 链上订单同步 API
 *
 * 功能：将链上订单数据同步到本地数据库
 * 改进：
 * 1. 使用缓存优化查询性能
 * 2. 提供详细的错误信息
 * 3. 区分不同的错误场景
 * 4. 增加智能重试机制应对索引延迟
 */
export async function POST(req: Request, { params }: RouteContext) {
  const { orderId } = await params;
  if (!orderId) {
    return apiBadRequest("orderId required");
  }

  const parsed = await parseBodyRaw(req, chainSyncSchema);
  if (!parsed.success) return parsed.response;
  const { data: body, rawBody } = parsed;

  const admin = await requireAdmin(req, { role: "viewer", requireOrigin: false, allowToken: true });
  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
  const maxWaitMs = Number(url.searchParams.get("maxWaitMs") || "3000");
  const digestFromQuery = url.searchParams.get("digest")?.trim();
  const digestFromBody = typeof body.digest === "string" ? body.digest.trim() : "";
  const digest = digestFromQuery || digestFromBody;
  let cachedLocalOrder: LocalOrderRecord | null | undefined;
  const loadLocalOrder = async () => {
    if (cachedLocalOrder === undefined) {
      cachedLocalOrder = await getOrderById(orderId);
    }
    return cachedLocalOrder;
  };

  // 智能重试查找链上订单
  // 应对场景：订单刚创建，Dubhe 索引器还未完成索引
  if (force) {
    clearChainOrderCache();
  }
  let chain = await findChainOrder(orderId, force);
  if (digest) {
    try {
      const fallback = buildDigestFallback(orderId, await loadLocalOrder());
      const byDigest = await findChainOrderFromDigest(digest, fallback);
      if (byDigest && byDigest.orderId === orderId) {
        if (!chain || byDigest.status > chain.status) {
          chain = byDigest;
        }
      }
    } catch {
      // ignore digest parse errors here
    }
  }

  if (!chain) {
    const delays = [1000, 2000, 4000, 8000];
    let waited = 0;
    for (const delay of delays) {
      if (waited >= maxWaitMs) break;
      await new Promise((resolve) => setTimeout(resolve, delay));
      waited += delay;
      chain = await findChainOrder(orderId, true);
      if (chain) break;
    }

    if (!chain && force) {
      // 最后尝试：绕过缓存直接从链上拉取
      chain = await findChainOrderDirect(orderId);
    }

    if (!chain && digest) {
      // 兜底：直接从交易 digest 解析事件
      const fallback = buildDigestFallback(orderId, await loadLocalOrder());
      const byDigest = await findChainOrderFromDigest(digest, fallback);
      if (byDigest && byDigest.orderId === orderId) {
        chain = byDigest;
      }
    }

    if (!chain) {
      const localOrder = await loadLocalOrder();
      const base = {
        error: "chain_order_not_found",
        message: ChainMessages.CHAIN_ORDER_NOT_FOUND,
        orderId,
      };

      if (process.env.NODE_ENV === "production") {
        return NextResponse.json(base, { status: 404 });
      }

      // Non-production: include diagnostic details
      const cacheStats = getChainOrderCacheStats();
      return NextResponse.json(
        {
          ...base,
          details: {
            existsInLocal: !!localOrder,
            localOrderSource: localOrder?.source || null,
            chainCacheStats: {
              totalOrders: cacheStats.orderCount,
              cacheAge: cacheStats.cacheAgeMs,
              lastFetch: cacheStats.lastFetch,
            },
            retries: delays.length,
            totalWaitTime: `${Math.min(
              maxWaitMs,
              delays.reduce((sum, value) => sum + value, 0)
            )}ms`,
            forced: force,
          },
        },
        { status: 404 }
      );
    }
  }

  if (!admin.ok) {
    const userAddressRaw = typeof body.userAddress === "string" ? body.userAddress : "";
    if (!userAddressRaw) {
      return apiUnauthorized("userAddress required");
    }
    const normalized = normalizeSuiAddress(userAddressRaw);
    if (!isValidSuiAddress(normalized)) {
      return apiBadRequest("invalid userAddress");
    }

    // Authenticate first, then check permission
    const auth = await requireUserAuth(req, {
      intent: `orders:chain-sync:${orderId}`,
      address: normalized,
      body: rawBody,
    });
    if (!auth.ok) return auth.response;

    if (chain.user !== normalized && chain.companion !== normalized) {
      // Fallback 1: allow the locally-assigned companion (covers index lag
      // where the chain object hasn't reflected the claim yet)
      const localOrder = await loadLocalOrder();
      const localCompanion = localOrder?.companionAddress
        ? normalizeSuiAddress(localOrder.companionAddress)
        : null;
      // Fallback 2: if the caller provided a valid digest, they just executed
      // a chain transaction for this order (e.g. claim/deposit) — allow sync
      // even before the local DB or chain index reflects the companion.
      const hasValidDigest = Boolean(digest);
      if (localCompanion !== normalized && !hasValidDigest) {
        return apiForbidden();
      }
    }
  }

  const synced = await upsertChainOrder(chain);
  if (digest && synced && !synced.chainDigest) {
    try {
      const fallback = buildDigestFallback(orderId, await loadLocalOrder());
      const byDigest = await findChainOrderFromDigest(digest, fallback);
      if (byDigest && byDigest.orderId === orderId) {
        await updateOrder(orderId, { chainDigest: digest });
      }
    } catch {
      // ignore digest persistence failures
    }
  }

  return NextResponse.json({
    success: true,
    order: synced,
    syncedFrom: "chain",
    chainStatus: chain.status,
  });
}
