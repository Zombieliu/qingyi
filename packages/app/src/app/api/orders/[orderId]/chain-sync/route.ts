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
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  let rawBody = "";
  let body: { userAddress?: string; digest?: string } = {};
  try {
    rawBody = await req.text();
    body = rawBody ? (JSON.parse(rawBody) as { userAddress?: string; digest?: string }) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const admin = await requireAdmin(req, { role: "viewer", requireOrigin: false, allowToken: true });
  const url = new URL(req.url);
  const force =
    url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
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
      // 所有重试失败，返回详细错误信息
      const cacheStats = getChainOrderCacheStats();
      const localOrder = await loadLocalOrder();

      const errorDetail = {
        error: "chain_order_not_found",
        message: "链上订单未找到",
        orderId,
        details: {
          existsInLocal: !!localOrder,
          localOrderSource: localOrder?.source || null,
          chainCacheStats: {
            totalOrders: cacheStats.orderCount,
            cacheAge: cacheStats.cacheAgeMs,
            lastFetch: cacheStats.lastFetch,
          },
          retries: delays.length,
          totalWaitTime: `${Math.min(maxWaitMs, delays.reduce((sum, value) => sum + value, 0))}ms`,
          forced: force,
        },
        possibleReasons: [
          "订单事件尚未被 Dubhe 索引器索引（已等待）",
          "订单未在区块链上成功创建",
          "订单超出查询范围（超过 " + (process.env.ADMIN_CHAIN_EVENT_LIMIT || "1000") + " 条）",
          "网络配置错误（当前：" + (process.env.SUI_NETWORK || process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") + "）",
        ],
        troubleshooting: [
          "等待几秒后重试",
          "检查订单交易 digest 在 Sui Explorer 中的状态",
          "确认 PACKAGE_ID 和 DAPP_HUB_ID 配置正确",
          "检查 Dubhe 索引器是否正常运行",
          "尝试增加 ADMIN_CHAIN_EVENT_LIMIT 环境变量",
        ],
      };

      return NextResponse.json(errorDetail, { status: 404 });
    }
  }

  if (!admin.ok) {
    const userAddressRaw = typeof body.userAddress === "string" ? body.userAddress : "";
    if (!userAddressRaw) {
      return NextResponse.json({ error: "userAddress required" }, { status: 401 });
    }
    const normalized = normalizeSuiAddress(userAddressRaw);
    if (!isValidSuiAddress(normalized)) {
      return NextResponse.json({ error: "invalid userAddress" }, { status: 400 });
    }
    if (chain.user !== normalized && chain.companion !== normalized) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    const auth = await requireUserAuth(req, {
      intent: `orders:chain-sync:${orderId}`,
      address: normalized,
      body: rawBody,
    });
    if (!auth.ok) return auth.response;
  }

  const synced = await upsertChainOrder(chain);
  if (digest && !synced.chainDigest) {
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
