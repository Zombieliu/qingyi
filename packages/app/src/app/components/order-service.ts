"use client";

import { addOrder, loadOrders, removeOrder, updateOrder, type LocalOrder } from "./order-store";
import { getCurrentAddress, isChainOrdersEnabled } from "@/lib/qy-chain";

const ORDER_SOURCE =
  process.env.NEXT_PUBLIC_ORDER_SOURCE || (process.env.NEXT_PUBLIC_CHAIN_ORDERS === "1" ? "server" : "local");

type ServerOrder = {
  id: string;
  user: string;
  userAddress?: string | null;
  companionAddress?: string | null;
  item: string;
  amount: number;
  currency: string;
  paymentStatus: string;
  stage: string;
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

function normalizeOrder(order: ServerOrder): LocalOrder {
  const meta = (order.meta || {}) as Record<string, unknown>;
  const metaStatus = typeof meta.status === "string" ? meta.status : undefined;
  const chainMeta = meta.chain as { status?: number } | undefined;
  const hasChainStatus = order.chainStatus !== undefined && order.chainStatus !== null;
  const isChain = Boolean(order.chainDigest) || hasChainStatus || chainMeta?.status !== undefined;
  const status = isChain ? order.stage || order.paymentStatus : metaStatus || order.stage || order.paymentStatus;
  const time =
    typeof meta.time === "string" ? meta.time : new Date(order.createdAt).toISOString();
  return {
    id: order.id,
    user: order.user,
    item: order.item,
    amount: order.amount,
    status: status || "待处理",
    time,
    chainDigest: order.chainDigest || (meta.chainDigest as string | undefined),
    serviceFee: typeof order.serviceFee === "number" ? order.serviceFee : (meta.serviceFee as number | undefined),
    serviceFeePaid: meta.serviceFeePaid as boolean | undefined,
    depositPaid: meta.depositPaid as boolean | undefined,
    playerPaid: meta.playerPaid as boolean | undefined,
    playerDue: meta.playerDue as number | undefined,
    driver: meta.driver as LocalOrder["driver"],
    meta,
  };
}

function buildMeta(order: Partial<LocalOrder>) {
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

function resolveUserAddress() {
  return isChainOrdersEnabled() ? getCurrentAddress() : "";
}

export async function fetchOrders(): Promise<LocalOrder[]> {
  if (ORDER_SOURCE !== "server") {
    return loadOrders();
  }
  const userAddress = resolveUserAddress();
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("pageSize", "50");
  if (userAddress) params.set("userAddress", userAddress);
  const res = await fetch(`/api/orders?${params.toString()}`);
  if (!res.ok) return [];
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  return items.map((item: ServerOrder) => normalizeOrder(item));
}

export async function createOrder(
  payload: LocalOrder & { userAddress?: string; companionAddress?: string; note?: string }
): Promise<{ orderId: string; sent?: boolean; error?: string }> {
  if (ORDER_SOURCE !== "server") {
    addOrder(payload);
    return { orderId: payload.id, sent: true };
  }
  const meta = buildMeta(payload);
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user: payload.user,
      userAddress: payload.userAddress,
      companionAddress: payload.companionAddress,
      item: payload.item,
      amount: payload.amount,
      status: payload.status,
      note: "note" in payload ? (payload as { note?: string }).note : undefined,
      orderId: payload.id,
      chainDigest: payload.chainDigest,
      serviceFee: payload.serviceFee,
      meta,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || "创建订单失败");
  }
  return {
    orderId: data?.orderId || payload.id,
    sent: data?.sent,
    error: data?.error,
  };
}

export async function patchOrder(orderId: string, patch: Partial<LocalOrder> & { userAddress?: string }) {
  if (ORDER_SOURCE !== "server") {
    updateOrder(orderId, patch);
    return;
  }
  const meta = buildMeta(patch);
  await fetch(`/api/orders/${orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userAddress: patch.userAddress,
      status: patch.status,
      meta,
    }),
  });
}

export async function deleteOrder(orderId: string, userAddress?: string) {
  if (ORDER_SOURCE !== "server") {
    removeOrder(orderId);
    return;
  }
  await fetch(`/api/orders/${orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userAddress, status: "取消" }),
  });
}

export async function syncChainOrder(orderId: string, userAddress?: string) {
  if (ORDER_SOURCE !== "server") {
    return;
  }
  const res = await fetch(`/api/orders/${orderId}/chain-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userAddress }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || "chain sync failed");
  }
  return res.json();
}

export function isServerOrderEnabled() {
  return ORDER_SOURCE === "server";
}
