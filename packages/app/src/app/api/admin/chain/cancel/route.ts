import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { cancelOrderAdmin } from "@/lib/chain-admin";
import { findChainOrder, syncChainOrder } from "@/lib/chain-sync";
import * as chainOrderUtils from "@/lib/chain-order-utils";
import { recordAudit } from "@/lib/admin-audit";

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  let body: { orderId?: string; reason?: string } = {};
  try {
    body = (await req.json()) as { orderId?: string; reason?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orderId = body.orderId?.trim() || "";
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }
  if (!/^[0-9]+$/.test(orderId)) {
    return NextResponse.json({ error: "orderId must be numeric" }, { status: 400 });
  }

  try {
    // 强制刷新以获取最新状态
    const chainOrder = await findChainOrder(orderId, true);
    if (!chainOrder) {
      return NextResponse.json(
        {
          error: "chain_order_not_found",
          message: "未找到链上订单",
          orderId,
          troubleshooting: [
            "检查订单 ID 是否正确",
            "确认订单已在区块链上创建",
            "检查网络配置（当前：" + (process.env.SUI_NETWORK || "testnet") + "）",
          ],
        },
        { status: 404 }
      );
    }
    if (!chainOrderUtils.isChainOrderCancelable(chainOrder.status)) {
      return NextResponse.json(
        {
          error: "order_not_cancelable",
          message: "订单已进入锁押金/争议流程，无法取消",
          currentStatus: chainOrder.status,
          allowedStatuses: [0, 1], // CREATED, PAID
        },
        { status: 400 }
      );
    }
    const result = await cancelOrderAdmin(orderId);
    await syncChainOrder(orderId);
    await recordAudit(req, auth, "chain.cancel", "order", orderId, {
      reason: body.reason || "",
      digest: result.digest,
    });
    return NextResponse.json({ ok: true, digest: result.digest, effects: result.effects });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "cancel failed" }, { status: 500 });
  }
}
