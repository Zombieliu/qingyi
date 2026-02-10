import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { findChainOrder, upsertChainOrder, getChainOrderCacheStats } from "@/lib/chain-sync";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { requireUserAuth } from "@/lib/user-auth";
import { getOrderById } from "@/lib/admin-store";

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

/**
 * 链上订单同步 API
 *
 * 功能：将链上订单数据同步到本地数据库
 * 改进：
 * 1. 使用缓存优化查询性能
 * 2. 提供详细的错误信息
 * 3. 区分不同的错误场景
 */
export async function POST(req: Request, { params }: RouteContext) {
  const { orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  const admin = await requireAdmin(req, { role: "viewer", requireOrigin: false, allowToken: true });

  // 先尝试从缓存查找（快速路径）
  let chain = await findChainOrder(orderId, false);

  if (!chain) {
    // 缓存中没有，强制刷新缓存再试一次
    chain = await findChainOrder(orderId, true);

    if (!chain) {
      // 获取缓存统计信息用于调试
      const cacheStats = getChainOrderCacheStats();
      const localOrder = await getOrderById(orderId);

      // 构建详细的错误响应
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
        },
        possibleReasons: [
          "订单未在区块链上创建",
          "订单事件尚未被索引",
          "订单超出查询范围（超过 " + (process.env.ADMIN_CHAIN_EVENT_LIMIT || "1000") + " 条）",
          "网络配置错误（当前：" + (process.env.SUI_NETWORK || process.env.NEXT_PUBLIC_SUI_NETWORK || "testnet") + "）",
        ],
        troubleshooting: [
          "检查订单是否在 Sui Explorer 中存在",
          "确认 PACKAGE_ID 和 DAPP_HUB_ID 配置正确",
          "检查 Dubhe 索引器是否正常运行",
          "尝试增加 ADMIN_CHAIN_EVENT_LIMIT 环境变量",
        ],
      };

      return NextResponse.json(errorDetail, { status: 404 });
    }
  }

  if (!admin.ok) {
    let rawBody = "";
    let body: { userAddress?: string } = {};
    try {
      rawBody = await req.text();
      body = rawBody ? (JSON.parse(rawBody) as { userAddress?: string }) : {};
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const userAddressRaw = typeof body.userAddress === "string" ? body.userAddress : "";
    if (!userAddressRaw) {
      return NextResponse.json({ error: "userAddress required" }, { status: 401 });
    }
    const normalized = normalizeSuiAddress(userAddressRaw);
    if (!isValidSuiAddress(normalized)) {
      return NextResponse.json({ error: "invalid userAddress" }, { status: 400 });
    }
    if (chain.user !== normalized) {
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

  return NextResponse.json({
    success: true,
    order: synced,
    syncedFrom: "chain",
    chainStatus: chain.status,
  });
}
