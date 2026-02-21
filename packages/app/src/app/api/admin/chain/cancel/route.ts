import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { cancelOrderAdmin } from "@/lib/chain/chain-admin";
import { findChainOrder, syncChainOrder } from "@/lib/chain/chain-sync";
import * as chainOrderUtils from "@/lib/chain/chain-order-utils";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseBody } from "@/lib/shared/api-validation";
import { env } from "@/lib/env";

const postSchema = z.object({
  orderId: z
    .string()
    .trim()
    .min(1)
    .regex(/^[0-9]+$/),
  reason: z.string().optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, postSchema);
  if (!parsed.success) return parsed.response;
  const { orderId, reason } = parsed.data;

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
            "检查网络配置（当前：" + env.SUI_NETWORK + "）",
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
      reason: reason || "",
      digest: result.digest,
    });
    return NextResponse.json({ ok: true, digest: result.digest, effects: result.effects });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "cancel failed" }, { status: 500 });
  }
}
