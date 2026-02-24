import "server-only";
import { prisma } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/feature-flags";

function logDispute(event: string, data: Record<string, unknown>) {
  console.log(
    JSON.stringify({ type: "dispute", event, ...data, timestamp: new Date().toISOString() })
  );
}

export type DisputeReason =
  | "service_quality" // 服务质量问题
  | "no_show" // 陪练未到
  | "wrong_service" // 服务内容不符
  | "overcharge" // 多收费
  | "other"; // 其他

export type DisputeStatus =
  | "pending"
  | "reviewing"
  | "resolved_refund"
  | "resolved_reject"
  | "resolved_partial";

export type DisputeRecord = {
  id: string;
  orderId: string;
  userAddress: string;
  reason: DisputeReason;
  description: string;
  evidence?: string[]; // 截图 URL
  status: DisputeStatus;
  resolution?: string;
  refundAmount?: number;
  reviewerRole?: string;
  createdAt: Date;
  resolvedAt?: Date;
};

/** Create a dispute for an order */
export async function createDispute(params: {
  orderId: string;
  userAddress: string;
  reason: DisputeReason;
  description: string;
  evidence?: string[];
}): Promise<DisputeRecord> {
  if (!isFeatureEnabled("dispute_flow")) throw new Error("争议功能暂未开放");
  const order = await prisma.adminOrder.findUnique({ where: { id: params.orderId } });
  if (!order) throw new Error("订单不存在");
  if (order.userAddress !== params.userAddress) throw new Error("无权操作此订单");
  if (!["已完成", "进行中"].includes(order.stage)) {
    throw new Error("当前订单状态不支持发起争议");
  }

  // Update order stage
  await prisma.adminOrder.update({
    where: { id: params.orderId },
    data: { stage: "争议中" },
  });

  const id = `DSP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const dispute: DisputeRecord = {
    id,
    orderId: params.orderId,
    userAddress: params.userAddress,
    reason: params.reason,
    description: params.description,
    evidence: params.evidence,
    status: "pending",
    createdAt: new Date(),
  };

  // Store in order meta
  await prisma.adminOrder.update({
    where: { id: params.orderId },
    data: {
      meta: {
        ...((order.meta as Record<string, unknown>) || {}),
        dispute,
      },
    },
  });

  logDispute("dispute_created", {
    orderId: params.orderId,
    reason: params.reason,
    userAddress: params.userAddress,
  });

  // Notify companion
  try {
    const { notifyOrderStatusChange } = await import("@/lib/services/notification-service");
    if (order.companionAddress) {
      await notifyOrderStatusChange({
        userAddress: order.companionAddress!,
        orderId: params.orderId,
        stage: "争议中",
        item: order.item,
      });
    }
  } catch {
    /* notification is best-effort */
  }

  return dispute;
}

/** Resolve a dispute (admin action) */
export async function resolveDispute(params: {
  orderId: string;
  resolution: "refund" | "reject" | "partial";
  refundAmount?: number;
  note?: string;
  reviewerRole?: string;
}): Promise<DisputeRecord> {
  const order = await prisma.adminOrder.findUnique({ where: { id: params.orderId } });
  if (!order) throw new Error("订单不存在");

  const meta = (order.meta as Record<string, unknown>) || {};
  const dispute = meta.dispute as DisputeRecord | undefined;
  if (!dispute) throw new Error("该订单没有争议记录");

  const statusMap: Record<string, DisputeStatus> = {
    refund: "resolved_refund",
    reject: "resolved_reject",
    partial: "resolved_partial",
  };

  const resolved: DisputeRecord = {
    ...dispute,
    status: statusMap[params.resolution],
    resolution: params.note,
    refundAmount:
      params.resolution === "reject" ? 0 : (params.refundAmount ?? Number(order.amount)),
    reviewerRole: params.reviewerRole,
    resolvedAt: new Date(),
  };

  const newStage = params.resolution === "reject" ? "已完成" : "已退款";

  await prisma.adminOrder.update({
    where: { id: params.orderId },
    data: {
      stage: newStage,
      meta: { ...meta, dispute: resolved },
    },
  });

  logDispute("dispute_resolved", {
    orderId: params.orderId,
    resolution: params.resolution,
    refundAmount: resolved.refundAmount,
  });

  // Notify user
  try {
    const { notifyOrderStatusChange } = await import("@/lib/services/notification-service");
    await notifyOrderStatusChange({
      userAddress: dispute.userAddress,
      orderId: params.orderId,
      stage: newStage,
      item: order.item,
    });
  } catch {
    /* best-effort */
  }

  return resolved;
}

/** Get dispute for an order */
export async function getDispute(orderId: string): Promise<DisputeRecord | null> {
  const order = await prisma.adminOrder.findUnique({ where: { id: orderId } });
  if (!order) return null;
  const meta = (order.meta as Record<string, unknown>) || {};
  return (meta.dispute as DisputeRecord) || null;
}

/** List all disputes for a user */
export async function listUserDisputes(userAddress: string): Promise<DisputeRecord[]> {
  const orders = await prisma.adminOrder.findMany({
    where: {
      userAddress,
      stage: { in: ["争议中", "已退款"] },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  return orders
    .map((o) => {
      const meta = (o.meta as Record<string, unknown>) || {};
      return meta.dispute as DisputeRecord | undefined;
    })
    .filter((d): d is DisputeRecord => !!d);
}
