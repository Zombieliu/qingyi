import type { DuoOrder } from "./admin-types";
import { mapDuoOrder } from "./duo-order-query-store";
import { prisma, Prisma, type TransactionClient } from "./admin-store-utils";

export {
  mapDuoOrder,
  listDuoOrders,
  queryDuoOrders,
  queryDuoOrdersCursor,
  queryPublicDuoOrdersCursor,
} from "./duo-order-query-store";

export async function getDuoOrderById(orderId: string) {
  const row = await prisma.duoOrder.findUnique({ where: { id: orderId } });
  return row ? mapDuoOrder(row) : null;
}

export async function addDuoOrder(order: DuoOrder) {
  const row = await prisma.duoOrder.create({
    data: {
      id: order.id,
      user: order.user,
      userAddress: order.userAddress ?? null,
      companionAddressA: order.companionAddressA ?? null,
      companionAddressB: order.companionAddressB ?? null,
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
      depositPerCompanion: order.depositPerCompanion ?? null,
      teamStatus: order.teamStatus ?? 0,
      meta: order.meta ? (order.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      createdAt: new Date(order.createdAt),
      updatedAt: order.updatedAt ? new Date(order.updatedAt) : null,
    },
  });
  return mapDuoOrder(row);
}
export async function updateDuoOrder(
  orderId: string,
  patch: Partial<DuoOrder>,
  tx?: TransactionClient
) {
  try {
    const run = async (db: TransactionClient) => {
      const data: Prisma.DuoOrderUpdateInput = { updatedAt: new Date() };
      if (patch.paymentStatus !== undefined) data.paymentStatus = patch.paymentStatus;
      if (patch.note !== undefined) data.note = patch.note;
      if (patch.assignedTo !== undefined) data.assignedTo = patch.assignedTo;
      if (patch.stage !== undefined) data.stage = patch.stage;
      if (patch.user !== undefined) data.user = patch.user;
      if (patch.userAddress !== undefined) data.userAddress = patch.userAddress;
      if (patch.companionAddressA !== undefined) data.companionAddressA = patch.companionAddressA;
      if (patch.companionAddressB !== undefined) data.companionAddressB = patch.companionAddressB;
      if (patch.item !== undefined) data.item = patch.item;
      if (patch.amount !== undefined) data.amount = patch.amount;
      if (patch.currency !== undefined) data.currency = patch.currency;
      if (patch.source !== undefined) data.source = patch.source;
      if (patch.chainDigest !== undefined) data.chainDigest = patch.chainDigest;
      if (patch.chainStatus !== undefined) data.chainStatus = patch.chainStatus;
      if (patch.serviceFee !== undefined) data.serviceFee = patch.serviceFee;
      if (patch.depositPerCompanion !== undefined)
        data.depositPerCompanion = patch.depositPerCompanion;
      if (patch.teamStatus !== undefined) data.teamStatus = patch.teamStatus;
      if (patch.meta !== undefined) {
        const current = await db.duoOrder.findUnique({
          where: { id: orderId },
          select: { meta: true },
        });
        const merged = {
          ...(current?.meta ? (current.meta as Record<string, unknown>) : {}),
          ...(patch.meta || {}),
        };
        data.meta = Object.keys(merged).length ? (merged as Prisma.InputJsonValue) : Prisma.DbNull;
      }
      const row = await db.duoOrder.update({ where: { id: orderId }, data });
      return mapDuoOrder(row);
    };

    return tx ? await run(tx) : await prisma.$transaction(async (txClient) => run(txClient));
  } catch {
    return null;
  }
}

/** Atomic slot claim — returns updated order or null on conflict. */
export async function claimDuoSlot(orderId: string, companionAddress: string) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.duoOrder.findUnique({ where: { id: orderId } });
    if (!current) return null;
    if (!current.companionAddressA) {
      if (current.companionAddressB === companionAddress) return null;
      const r = await tx.duoOrder.updateMany({
        where: { id: orderId, companionAddressA: null },
        data: { companionAddressA: companionAddress, updatedAt: new Date() },
      });
      if (r.count === 0) return null;
    } else if (!current.companionAddressB) {
      if (current.companionAddressA === companionAddress) return null;
      const r = await tx.duoOrder.updateMany({
        where: { id: orderId, companionAddressB: null },
        data: { companionAddressB: companionAddress, updatedAt: new Date() },
      });
      if (r.count === 0) return null;
    } else {
      return null; // both slots filled
    }
    const row = await tx.duoOrder.findUnique({ where: { id: orderId } });
    return row ? mapDuoOrder(row) : null;
  });
}

/** Atomic slot release — returns updated order or null. */
export async function releaseDuoSlot(orderId: string, slot: "A" | "B") {
  return prisma.$transaction(async (tx) => {
    const current = await tx.duoOrder.findUnique({ where: { id: orderId } });
    if (!current) return null;
    const data: Prisma.DuoOrderUpdateInput = { updatedAt: new Date() };
    if (slot === "A") {
      data.companionAddressA = null;
      if (current.teamStatus === 1)
        data.teamStatus = 0; // A_DEPOSITED → WAITING
      else if (current.teamStatus === 3) data.teamStatus = 2; // READY → B_DEPOSITED
    } else {
      data.companionAddressB = null;
      if (current.teamStatus === 2)
        data.teamStatus = 0; // B_DEPOSITED → WAITING
      else if (current.teamStatus === 3) data.teamStatus = 1; // READY → A_DEPOSITED
    }
    if (current.chainStatus === 2) {
      data.chainStatus = 1;
      data.stage = "已确认";
      data.paymentStatus = "服务费已付";
    }
    const row = await tx.duoOrder.update({ where: { id: orderId }, data });
    return mapDuoOrder(row);
  });
}

export async function upsertDuoOrder(order: DuoOrder) {
  const row = await prisma.duoOrder.upsert({
    where: { id: order.id },
    create: {
      id: order.id,
      user: order.user,
      userAddress: order.userAddress ?? null,
      companionAddressA: order.companionAddressA ?? null,
      companionAddressB: order.companionAddressB ?? null,
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
      depositPerCompanion: order.depositPerCompanion ?? null,
      teamStatus: order.teamStatus ?? 0,
      meta: order.meta ? (order.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      createdAt: new Date(order.createdAt),
      updatedAt: order.updatedAt ? new Date(order.updatedAt) : null,
    },
    update: {
      user: order.user,
      userAddress: order.userAddress ?? null,
      companionAddressA: order.companionAddressA ?? null,
      companionAddressB: order.companionAddressB ?? null,
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
      depositPerCompanion: order.depositPerCompanion ?? null,
      teamStatus: order.teamStatus ?? 0,
      meta: order.meta ? (order.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      updatedAt: new Date(),
    },
  });
  return mapDuoOrder(row);
}
