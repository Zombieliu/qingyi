import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { findChainOrder, findChainOrderDirect } from "@/lib/chain/chain-sync";
import { getOrderById } from "@/lib/admin/admin-store";

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

type ChainOrderComparison = {
  statusMatch: boolean;
  chainStatus: number;
  localChainStatus: number | null;
  userAddressMatch: boolean;
  companionAddressMatch: boolean;
  needsSync: boolean;
};

/**
 * 查询单个链上订单的详细信息
 *
 * GET /api/admin/chain/order/[orderId]?direct=true
 *
 * Query 参数：
 * - direct: 是否绕过缓存直接查询区块链（默认 false）
 */
export async function GET(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;

  const { orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

  const url = new URL(req.url);
  const useDirect = url.searchParams.get("direct") === "true";

  // 根据参数选择查询方式
  const chainOrder = useDirect
    ? await findChainOrderDirect(orderId)
    : await findChainOrder(orderId, false);

  const localOrder = await getOrderById(orderId);

  if (!chainOrder && !localOrder) {
    return NextResponse.json(
      {
        error: "order_not_found",
        message: "订单不存在（链上和本地均未找到）",
        orderId,
      },
      { status: 404 }
    );
  }

  type ChainOrderResult = Awaited<ReturnType<typeof findChainOrder>>;
  type LocalOrderSummary = {
    id: string;
    stage: string;
    paymentStatus: string;
    source: string | null;
    chainStatus: number | null;
    userAddress: string | null;
    companionAddress: string | null;
    serviceFee: number | null;
    deposit: number | null;
    createdAt: number;
  };

  const response: {
    orderId: string;
    chainOrder: ChainOrderResult | null;
    localOrder: LocalOrderSummary | null;
    comparison: ChainOrderComparison | null;
  } = {
    orderId,
    chainOrder: chainOrder || null,
    localOrder: localOrder
      ? {
          id: localOrder.id,
          stage: localOrder.stage,
          paymentStatus: localOrder.paymentStatus,
          source: localOrder.source ?? null,
          chainStatus: localOrder.chainStatus ?? null,
          userAddress: localOrder.userAddress ?? null,
          companionAddress: localOrder.companionAddress ?? null,
          serviceFee: localOrder.serviceFee ?? null,
          deposit: localOrder.deposit ?? null,
          createdAt: localOrder.createdAt,
        }
      : null,
    comparison: null,
  };

  // 如果两边都有数据，进行比较
  if (chainOrder && localOrder) {
    const localChainStatus = localOrder.chainStatus ?? null;
    const localUserAddress = localOrder.userAddress ?? null;
    const localCompanionAddress = localOrder.companionAddress ?? null;
    response.comparison = {
      statusMatch: chainOrder.status === localChainStatus,
      chainStatus: chainOrder.status,
      localChainStatus,
      userAddressMatch: chainOrder.user === localUserAddress,
      companionAddressMatch: chainOrder.companion === localCompanionAddress,
      needsSync: chainOrder.status !== localChainStatus,
    };
  }

  return NextResponse.json(response);
}
