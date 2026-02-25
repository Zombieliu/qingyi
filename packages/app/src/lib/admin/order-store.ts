import type { AdminOrder } from "./admin-types";
import { mapOrder } from "./order-query-store";
import { prisma, Prisma, type TransactionClient } from "./admin-store-utils";
import { creditMantou } from "./mantou-store";
import { AdminMessages } from "@/lib/shared/messages";

// 向后兼容 re-export — 查询函数
export {
  mapOrder,
  listOrders,
  queryOrders,
  queryOrdersCursor,
  queryPublicOrdersCursor,
  hasOrdersForAddress,
  listE2eOrderIds,
} from "./order-query-store";

// 向后兼容 re-export — chain 查询函数
export {
  listChainOrdersForAdmin,
  listChainOrdersForAutoFinalize,
  listChainOrdersForCleanup,
} from "./order-chain-store";

export async function getOrderById(orderId: string) {
  const row = await prisma.adminOrder.findUnique({ where: { id: orderId } });
  return row ? mapOrder(row) : null;
}

export async function removeOrders(orderIds: string[]) {
  const ids = orderIds.filter(Boolean);
  if (ids.length === 0) return 0;
  const result = await prisma.adminOrder.deleteMany({ where: { id: { in: ids } } });
  return result.count;
}

export async function addOrder(order: AdminOrder) {
  const row = await prisma.adminOrder.create({
    data: {
      id: order.id,
      user: order.user,
      userAddress: order.userAddress ?? null,
      companionAddress: order.companionAddress ?? null,
      item: order.item,
      amount: order.amount,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      stage: order.stage,
      note: order.note ?? null,
      assignedTo: order.assignedTo ?? null,
      source: order.source ?? null,
      chainDigest: order.chainDigest ?? null,
      chainStatus: order.chainStatus ?? null,
      serviceFee: order.serviceFee ?? null,
      deposit: order.deposit ?? null,
      meta: order.meta ? (order.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      createdAt: new Date(order.createdAt),
      updatedAt: order.updatedAt ? new Date(order.updatedAt) : null,
    },
  });
  return mapOrder(row);
}

export async function updateOrder(
  orderId: string,
  patch: Partial<AdminOrder>,
  tx?: TransactionClient
) {
  try {
    const run = async (db: TransactionClient) => {
      const data: Prisma.AdminOrderUpdateInput = { updatedAt: new Date() };
      if (patch.paymentStatus !== undefined) data.paymentStatus = patch.paymentStatus;
      if (patch.note !== undefined) data.note = patch.note;
      if (patch.assignedTo !== undefined) data.assignedTo = patch.assignedTo;
      if (patch.stage !== undefined) data.stage = patch.stage;
      if (patch.user !== undefined) data.user = patch.user;
      if (patch.userAddress !== undefined) data.userAddress = patch.userAddress;
      if (patch.companionAddress !== undefined) data.companionAddress = patch.companionAddress;
      if (patch.item !== undefined) data.item = patch.item;
      if (patch.amount !== undefined) data.amount = patch.amount;
      if (patch.currency !== undefined) data.currency = patch.currency;
      if (patch.source !== undefined) data.source = patch.source;
      if (patch.chainDigest !== undefined) data.chainDigest = patch.chainDigest;
      if (patch.chainStatus !== undefined) data.chainStatus = patch.chainStatus;
      if (patch.serviceFee !== undefined) data.serviceFee = patch.serviceFee;
      if (patch.deposit !== undefined) data.deposit = patch.deposit;
      if (patch.meta !== undefined) {
        const current = await db.adminOrder.findUnique({
          where: { id: orderId },
          select: { meta: true },
        });
        const merged = {
          ...(current?.meta ? (current.meta as Record<string, unknown>) : {}),
          ...(patch.meta || {}),
        };
        data.meta = Object.keys(merged).length ? (merged as Prisma.InputJsonValue) : Prisma.DbNull;
      }
      const row = await db.adminOrder.update({ where: { id: orderId }, data });
      const mapped = mapOrder(row);
      await maybeCreditMantouForCompletedOrder(mapped, db);
      await maybeAwardGrowthPoints(mapped, db);
      return mapped;
    };

    const mapped = tx
      ? await run(tx)
      : await prisma.$transaction(async (txClient) => run(txClient));
    // Notifications are non-critical, run outside the transaction
    await maybeNotifyOrderUpdate(mapped, patch);
    return mapped;
  } catch {
    return null;
  }
}

async function maybeCreditMantouForCompletedOrder(order: AdminOrder, tx?: TransactionClient) {
  if (order.stage !== "已完成") return;
  const address = (order.companionAddress || "").trim();
  if (!address) return;
  const meta = (order.meta || {}) as Record<string, unknown>;
  const diamondCharge = Number(meta.diamondCharge ?? 0);
  if (!Number.isFinite(diamondCharge) || diamondCharge <= 0) return;
  try {
    await creditMantou({
      address,
      amount: Math.floor(diamondCharge),
      orderId: order.id,
      note: AdminMessages.DIAMOND_EXCHANGE_NOTE(order.id),
      tx,
    });
  } catch {
    // Ignore auto-credit failures to avoid blocking order updates.
  }
}

async function maybeAwardGrowthPoints(order: AdminOrder, tx?: TransactionClient) {
  if (order.stage !== "已完成") return;
  const address = (order.userAddress || "").trim();
  if (!address) return;
  try {
    const { onOrderCompleted } = await import("@/lib/services/growth-service");
    await onOrderCompleted({
      userAddress: address,
      amount: order.amount,
      orderId: order.id,
      tx,
    });
  } catch {
    // Ignore growth point failures to avoid blocking order updates.
  }
}

async function maybeNotifyOrderUpdate(order: AdminOrder, patch: Partial<AdminOrder>) {
  if (!patch.stage) return;
  try {
    const { notifyOrderStatusChange, notifyCompanionNewOrder } =
      await import("@/lib/services/notification-service");
    if (order.userAddress) {
      await notifyOrderStatusChange({
        userAddress: order.userAddress,
        orderId: order.id,
        stage: order.stage,
        item: order.item,
      });
    }
    if (order.companionAddress && (patch.stage === "已确认" || patch.stage === "进行中")) {
      await notifyCompanionNewOrder({
        companionAddress: order.companionAddress,
        orderId: order.id,
        item: order.item,
        amount: order.amount,
      });
    }
  } catch {
    // non-critical
  }
}

export async function updateOrderIfUnassigned(orderId: string, patch: Partial<AdminOrder>) {
  try {
    const current = await prisma.adminOrder.findUnique({
      where: { id: orderId },
      select: { meta: true, companionAddress: true },
    });
    if (!current || current.companionAddress) return null;
    const data: Prisma.AdminOrderUpdateManyMutationInput = { updatedAt: new Date() };
    if (patch.stage !== undefined) data.stage = patch.stage;
    if (patch.companionAddress !== undefined) data.companionAddress = patch.companionAddress;
    if (patch.meta !== undefined) {
      const merged = {
        ...(current.meta ? (current.meta as Record<string, unknown>) : {}),
        ...(patch.meta || {}),
      };
      data.meta = Object.keys(merged).length ? (merged as Prisma.InputJsonValue) : Prisma.DbNull;
    }
    const result = await prisma.adminOrder.updateMany({
      where: { id: orderId, companionAddress: null },
      data,
    });
    if (result.count === 0) return null;
    const row = await prisma.adminOrder.findUnique({ where: { id: orderId } });
    return row ? mapOrder(row) : null;
  } catch {
    return null;
  }
}

export async function upsertOrder(order: AdminOrder) {
  const row = await prisma.adminOrder.upsert({
    where: { id: order.id },
    create: {
      id: order.id,
      user: order.user,
      userAddress: order.userAddress ?? null,
      companionAddress: order.companionAddress ?? null,
      item: order.item,
      amount: order.amount,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      stage: order.stage,
      note: order.note ?? null,
      assignedTo: order.assignedTo ?? null,
      source: order.source ?? null,
      chainDigest: order.chainDigest ?? null,
      chainStatus: order.chainStatus ?? null,
      serviceFee: order.serviceFee ?? null,
      deposit: order.deposit ?? null,
      meta: order.meta ? (order.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      createdAt: new Date(order.createdAt),
      updatedAt: order.updatedAt ? new Date(order.updatedAt) : null,
    },
    update: {
      user: order.user,
      userAddress: order.userAddress ?? null,
      companionAddress: order.companionAddress ?? null,
      item: order.item,
      amount: order.amount,
      currency: order.currency,
      paymentStatus: order.paymentStatus,
      stage: order.stage,
      note: order.note ?? null,
      assignedTo: order.assignedTo ?? null,
      source: order.source ?? null,
      chainDigest: order.chainDigest ?? null,
      chainStatus: order.chainStatus ?? null,
      serviceFee: order.serviceFee ?? null,
      deposit: order.deposit ?? null,
      meta: order.meta ? (order.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      updatedAt: new Date(),
    },
  });
  return mapOrder(row);
}
