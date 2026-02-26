import type { AdminOrder, OrderStage } from "./admin/admin-types";

export function isChainOrder(order: Pick<AdminOrder, "chainDigest" | "chainStatus" | "source">) {
  return Boolean(order.chainDigest) || order.chainStatus !== undefined || order.source === "chain";
}

// Order stage state machine.
// Design note: "已完成" cannot transition directly to "已退款" — it must go through
// "争议中" first. This is intentional: refunds require a formal dispute process.
const STAGE_FLOW: Record<OrderStage, OrderStage[]> = {
  待处理: ["待处理", "已确认", "进行中", "已取消"],
  已确认: ["已确认", "进行中", "已取消"],
  进行中: ["进行中", "已完成", "已取消", "争议中"],
  已完成: ["已完成", "争议中"],
  已取消: ["已取消"],
  争议中: ["争议中", "已完成", "已退款"],
  已退款: ["已退款"],
};

export function canTransitionStage(current: OrderStage, next: OrderStage) {
  if (current === next) return true;
  return STAGE_FLOW[current]?.includes(next) ?? false;
}
