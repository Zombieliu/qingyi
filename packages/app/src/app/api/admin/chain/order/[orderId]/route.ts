import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { findChainOrder, findChainOrderDirect } from "@/lib/chain/chain-sync";
import { getOrderById } from "@/lib/admin/admin-store";

type RouteContext = {
  params: Promise<{ orderId: string }>;
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

  const response = {
    orderId,
    chainOrder: chainOrder || null,
    localOrder: localOrder
      ? {
          id: localOrder.id,
          stage: localOrder.stage,
          paymentStatus: localOrder.paymentStatus,
          source: localOrder.source,
          chainStatus: localOrder.chainStatus,
          userAddress: localOrder.userAddress,
          companionAddress: localOrder.companionAddress,
          serviceFee: localOrder.serviceFee,
          deposit: localOrder.deposit,
          createdAt: localOrder.createdAt,
        }
      : null,
    comparison: null as any,
  };

  // 如果两边都有数据，进行比较
  if (chainOrder && localOrder) {
    response.comparison = {
      statusMatch: chainOrder.status === localOrder.chainStatus,
      chainStatus: chainOrder.status,
      localChainStatus: localOrder.chainStatus,
      userAddressMatch: chainOrder.user === localOrder.userAddress,
      companionAddressMatch: chainOrder.companion === localOrder.companionAddress,
      needsSync: chainOrder.status !== localOrder.chainStatus,
    };
  }

  return NextResponse.json(response);
}
