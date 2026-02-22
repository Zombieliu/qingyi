/**
 * 链上订单状态统一映射
 *
 * Chain status (number) 是链上合约的状态码，是唯一的 source of truth。
 * 所有其他状态字段（stage, paymentStatus）都从它派生。
 *
 * 优先级规则：
 * 1. 如果本地 DB 已有 chainStatus 且比链上新事件的 status 更大，保留本地值
 *    （防止旧事件覆盖新状态）
 * 2. 否则使用链上事件的 status
 * 3. stage 和 paymentStatus 始终从 effectiveStatus 派生
 */

import type { AdminOrder } from "@/lib/admin/admin-types";

/** 链上状态码 → 订单阶段 */
export function mapStage(chainStatus: number): AdminOrder["stage"] {
  if (chainStatus === 6) return "已取消";
  if (chainStatus === 5) return "已完成";
  if (chainStatus >= 2) return "进行中";
  if (chainStatus === 1) return "已确认";
  return "待处理";
}

/** 链上状态码 → 支付状态文案 */
export function mapPaymentStatus(chainStatus: number): string {
  switch (chainStatus) {
    case 0:
      return "未支付";
    case 1:
      return "撮合费已付";
    case 2:
      return "押金已锁定";
    case 3:
      return "待结算";
    case 4:
      return "争议中";
    case 5:
      return "已结算";
    case 6:
      return "已取消";
    default:
      return "未知";
  }
}

/**
 * 解析有效的链上状态码
 *
 * 从多个来源中确定最终的 chainStatus：
 * - existing: 数据库中已有的订单
 * - incomingStatus: 链上事件带来的新状态
 *
 * 规则：取较大值（状态只能前进，不能回退）
 */
export function resolveEffectiveChainStatus(
  existing: Pick<AdminOrder, "chainStatus" | "meta"> | null,
  incomingStatus: number
): number {
  if (!existing) return incomingStatus;

  const localStatus = getLocalChainStatus(existing);

  if (typeof localStatus === "number" && localStatus > incomingStatus) {
    return localStatus;
  }

  return incomingStatus;
}

/**
 * 从 effectiveStatus 一次性派生所有状态字段
 */
export function deriveOrderStatus(effectiveStatus: number) {
  const paymentStatus = mapPaymentStatus(effectiveStatus);
  return {
    chainStatus: effectiveStatus,
    paymentStatus,
    stage: mapStage(effectiveStatus),
    displayStatus: paymentStatus,
  };
}

/**
 * 从订单对象中提取本地 chainStatus
 * 优先 order.chainStatus，fallback 到 meta.chain.status
 */
export function getLocalChainStatus(
  order: { chainStatus?: number; meta?: Record<string, unknown> } | null | undefined
): number | undefined {
  if (!order) return undefined;
  if (typeof order.chainStatus === "number") return order.chainStatus;
  const meta = (order.meta || {}) as Record<string, unknown>;
  const chainMeta = (meta.chain as Record<string, unknown> | undefined) || undefined;
  if (typeof chainMeta?.status === "number") return chainMeta.status as number;
  return undefined;
}

/**
 * 合并本地和远程 chainStatus，取较大值
 */
export function mergeChainStatus(
  local: number | undefined,
  remote: number | undefined
): number | undefined {
  if (local === undefined && remote === undefined) return undefined;
  if (local === undefined) return remote;
  if (remote === undefined) return local;
  return Math.max(local, remote);
}
