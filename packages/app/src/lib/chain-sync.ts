import "server-only";
import { fetchChainOrdersAdmin } from "./chain-admin";
import { addOrder, getOrderById, updateOrder } from "./admin-store";
import type { AdminOrder } from "./admin-types";

function mapStage(status: number): AdminOrder["stage"] {
  if (status === 6) return "已取消";
  if (status === 5) return "已完成";
  if (status >= 2) return "进行中";
  if (status === 1) return "已确认";
  return "待处理";
}

function mapPaymentStatus(status: number): string {
  switch (status) {
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

function toCny(value: string): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Number((num / 100).toFixed(2));
}

export async function syncChainOrders() {
  const chainOrders = await fetchChainOrdersAdmin();
  let created = 0;
  let updated = 0;

  for (const chain of chainOrders) {
    const orderId = chain.orderId;
    const existing = await getOrderById(orderId);
    const serviceFee = toCny(chain.serviceFee);
    const deposit = toCny(chain.deposit);
    const amount = existing?.amount ?? Number((serviceFee + deposit).toFixed(2));

    const meta = {
      ...(existing?.meta || {}),
      chain: {
        status: chain.status,
        disputeDeadline: chain.disputeDeadline,
        lastUpdatedMs: chain.lastUpdatedMs,
        ruleSetId: chain.ruleSetId,
        evidenceHash: chain.evidenceHash,
      },
    } as Record<string, unknown>;

    if (existing) {
      await updateOrder(orderId, {
        userAddress: chain.user,
        companionAddress: chain.companion,
        chainStatus: chain.status,
        serviceFee,
        deposit,
        paymentStatus: mapPaymentStatus(chain.status),
        stage: mapStage(chain.status),
        meta,
      });
      updated += 1;
    } else {
      await addOrder({
        id: orderId,
        user: chain.user,
        userAddress: chain.user,
        companionAddress: chain.companion,
        item: `链上订单 #${orderId}`,
        amount,
        currency: "CNY",
        paymentStatus: mapPaymentStatus(chain.status),
        stage: mapStage(chain.status),
        note: "链上同步",
        source: "chain",
        chainStatus: chain.status,
        serviceFee,
        deposit,
        meta,
        createdAt: Number(chain.createdAt) || Date.now(),
      });
      created += 1;
    }
  }

  return { total: chainOrders.length, created, updated };
}
