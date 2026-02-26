import "server-only";
import { prisma } from "@/lib/db";
import { OrderMessages } from "@/lib/shared/messages";

/**
 * 支付对账服务
 * 对比本地订单状态与链上/支付渠道状态，发现不一致并生成对账报告。
 */

export type ReconcileResult = {
  orderId: string;
  localStatus: string;
  chainStatus?: number;
  paymentStatus: string;
  mismatch: boolean;
  issue?: string;
};

export type ReconcileReport = {
  total: number;
  matched: number;
  mismatched: number;
  items: ReconcileResult[];
  generatedAt: string;
};

/** Reconcile orders within a date range */
export async function reconcileOrders(params: {
  from: Date;
  to: Date;
  limit?: number;
}): Promise<ReconcileReport> {
  const orders = await prisma.adminOrder.findMany({
    where: {
      createdAt: { gte: params.from, lte: params.to },
      deletedAt: null, // P2 FIX: Exclude soft-deleted orders from reconciliation
    },
    orderBy: { createdAt: "desc" },
    take: params.limit || 500,
  });

  const items: ReconcileResult[] = [];

  for (const order of orders) {
    const meta = (order.meta as Record<string, unknown>) || {};
    const chainMeta = meta.chain as { status?: number } | undefined;
    const chainStatus = order.chainStatus ?? chainMeta?.status;

    let mismatch = false;
    let issue: string | undefined;

    // Rule 1: Chain order marked completed but local not
    if (
      chainStatus !== undefined &&
      chainStatus >= 4 &&
      order.stage !== "已完成" &&
      order.stage !== "已退款"
    ) {
      mismatch = true;
      issue = OrderMessages.RECONCILE_CHAIN_COMPLETED_LOCAL_NOT(chainStatus, order.stage);
    }

    // Rule 2: Local marked paid but no chain confirmation
    if (order.paymentStatus === "已支付" && order.source === "chain" && chainStatus === undefined) {
      mismatch = true;
      issue = OrderMessages.RECONCILE_PAID_NO_CHAIN;
    }

    // Rule 3: Order stuck in processing for too long (>24h)
    if (order.stage === "进行中" && order.createdAt) {
      const ageMs = Date.now() - new Date(order.createdAt).getTime();
      if (ageMs > 24 * 60 * 60 * 1000) {
        mismatch = true;
        issue = OrderMessages.RECONCILE_STUCK_PROCESSING(Math.round(ageMs / 3600000));
      }
    }

    // Rule 4: Refund status mismatch
    if (order.stage === "已退款" && order.paymentStatus !== "已退款") {
      mismatch = true;
      issue = OrderMessages.RECONCILE_REFUND_STATUS_MISMATCH;
    }

    // Rule 5: Amount mismatch between local and chain
    if (
      chainMeta &&
      typeof meta.chainAmount === "number" &&
      meta.chainAmount !== Number(order.amount)
    ) {
      mismatch = true;
      issue = OrderMessages.RECONCILE_AMOUNT_MISMATCH(
        Number(order.amount),
        meta.chainAmount as number
      );
    }

    items.push({
      orderId: order.id,
      localStatus: order.stage,
      chainStatus: chainStatus as number | undefined,
      paymentStatus: order.paymentStatus,
      mismatch,
      issue,
    });
  }

  const report: ReconcileReport = {
    total: items.length,
    matched: items.filter((i) => !i.mismatch).length,
    mismatched: items.filter((i) => i.mismatch).length,
    items: items.filter((i) => i.mismatch),
    generatedAt: new Date().toISOString(),
  };

  // Alert on anomalies (non-blocking)
  if (report.mismatched > 0) {
    import("@/lib/services/alert-service")
      .then(({ alertOnReconcile }) => alertOnReconcile(report.mismatched, report.total))
      .catch((e) => console.warn("[reconcile] alert failed", e));
  }

  return report;
}

/** Auto-fix reconciliation issues where safe */
export async function autoFixReconcile(report: ReconcileReport): Promise<{
  fixed: number;
  skipped: number;
  details: Array<{ orderId: string; action: string }>;
}> {
  const details: Array<{ orderId: string; action: string }> = [];
  let fixed = 0;
  let skipped = 0;

  for (const item of report.items) {
    // Only auto-fix clear-cut cases
    if (
      item.issue?.includes(OrderMessages.RECONCILE_REFUND_STATUS_MISMATCH) &&
      item.localStatus === "已退款"
    ) {
      await prisma.adminOrder.update({
        where: { id: item.orderId },
        data: { paymentStatus: "已退款" },
      });
      details.push({ orderId: item.orderId, action: OrderMessages.RECONCILE_FIX_REFUND_STATUS });
      fixed++;
    } else {
      skipped++;
    }
  }

  return { fixed, skipped, details };
}
