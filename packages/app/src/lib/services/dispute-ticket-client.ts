/** Fire-and-forget: create a support ticket for a chain dispute */
export function createDisputeTicket(params: {
  orderId: string;
  evidence: string;
  userAddress?: string;
  orderItem?: string;
  orderAmount?: number;
}) {
  const { orderId, evidence, userAddress, orderItem, orderAmount } = params;

  fetch("/api/support", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `链上争议 — 订单 ${orderId}\n理由：${evidence}`,
      userName: userAddress,
      userAddress,
      topic: "链上争议",
      meta: {
        type: "chain_dispute",
        orderId,
        evidence,
        orderItem,
        orderAmount,
      },
    }),
  }).catch(() => {
    // best-effort — failure must not block the main flow
  });
}
