"use client";

import { type LocalOrder } from "./order-store";
import { OrderMessages } from "@/lib/shared/messages";

export const ORDER_SOURCE = (() => {
  const explicit = process.env.NEXT_PUBLIC_ORDER_SOURCE;
  const chainEnabled = process.env.NEXT_PUBLIC_CHAIN_ORDERS === "1";
  if (explicit) {
    if (chainEnabled && explicit !== "server") {
      return "server";
    }
    return explicit;
  }
  if (process.env.NODE_ENV === "production") {
    return "server";
  }
  return chainEnabled ? "server" : "local";
})();

export type ServerOrder = {
  id: string;
  user: string;
  userAddress?: string | null;
  companionAddress?: string | null;
  item: string;
  amount: number;
  currency: string;
  paymentStatus: string;
  stage: string;
  /** Server-computed display status (single source of truth) */
  displayStatus?: string;
  note?: string | null;
  assignedTo?: string | null;
  source?: string | null;
  chainDigest?: string | null;
  chainStatus?: number | null;
  serviceFee?: number | null;
  deposit?: number | null;
  meta?: Record<string, unknown> | null;
  createdAt: number;
  updatedAt?: number | null;
};

export function normalizeOrder(order: ServerOrder): LocalOrder {
  const meta = (order.meta || {}) as Record<string, unknown>;
  const chainMeta = meta.chain as { status?: number } | undefined;
  const metaStatus = typeof meta.status === "string" ? meta.status : undefined;
  const status =
    order.displayStatus ||
    metaStatus ||
    order.stage ||
    order.paymentStatus ||
    OrderMessages.DEFAULT_STATUS;
  const time = typeof meta.time === "string" ? meta.time : new Date(order.createdAt).toISOString();
  return {
    id: order.id,
    user: order.user,
    userAddress: order.userAddress ?? undefined,
    companionAddress: order.companionAddress ?? undefined,
    item: order.item,
    amount: order.amount,
    status: status || OrderMessages.DEFAULT_STATUS,
    time,
    chainDigest: order.chainDigest || (meta.chainDigest as string | undefined),
    chainStatus: order.chainStatus ?? chainMeta?.status ?? undefined,
    serviceFee:
      typeof order.serviceFee === "number"
        ? order.serviceFee
        : (meta.serviceFee as number | undefined),
    serviceFeePaid: meta.serviceFeePaid as boolean | undefined,
    depositPaid: meta.depositPaid as boolean | undefined,
    playerPaid: meta.playerPaid as boolean | undefined,
    playerDue: meta.playerDue as number | undefined,
    driver: meta.driver as LocalOrder["driver"],
    meta,
  };
}

export function buildMeta(order: Partial<LocalOrder>) {
  const meta: Record<string, unknown> = {};
  if (order.status) meta.status = order.status;
  if (order.time) meta.time = order.time;
  if (order.serviceFeePaid !== undefined) meta.serviceFeePaid = order.serviceFeePaid;
  if (order.depositPaid !== undefined) meta.depositPaid = order.depositPaid;
  if (order.playerPaid !== undefined) meta.playerPaid = order.playerPaid;
  if (order.playerDue !== undefined) meta.playerDue = order.playerDue;
  if (order.driver) meta.driver = order.driver;
  if (order.chainDigest) meta.chainDigest = order.chainDigest;
  if (order.serviceFee !== undefined) meta.serviceFee = order.serviceFee;
  if (order.meta) Object.assign(meta, order.meta);
  return meta;
}

export function isServerOrderEnabled() {
  return ORDER_SOURCE === "server";
}
