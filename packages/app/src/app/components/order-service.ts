"use client";

import { addOrder, loadOrders, removeOrder, updateOrder, type LocalOrder } from "./order-store";
import { readCache, writeCache } from "./client-cache";
import { getCurrentAddress, isChainOrdersEnabled, signAuthIntent } from "@/lib/qy-chain";

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
    userAddress: order.userAddress ?? undefined,
    companionAddress: order.companionAddress ?? undefined,
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

export async function fetchOrders(options: { force?: boolean } = {}): Promise<LocalOrder[]> {
  if (ORDER_SOURCE !== "server") {
    return loadOrders();
  }
  const userAddress = resolveUserAddress();
  if (!userAddress) return [];
  const cacheKey = `cache:orders:${userAddress || "local"}`;
  if (!options.force) {
    const cached = readCache<LocalOrder[]>(cacheKey, 60_000, true);
    if (cached?.fresh) {
      return cached.value;
    }
  }
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("pageSize", "50");
  if (userAddress) params.set("address", userAddress);
  const { headers } = await buildAuthHeaders("orders:read");
  const res = await fetch(`/api/orders?${params.toString()}`, { headers });
  if (!res.ok) return cached?.value ?? [];
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const normalized = items.map((item: ServerOrder) => normalizeOrder(item));
  writeCache(cacheKey, normalized);
  return normalized;
}

export async function fetchOrderDetail(orderId: string, userAddress?: string): Promise<LocalOrder | null> {
  if (!orderId) return null;
  if (ORDER_SOURCE !== "server") {
    return loadOrders().find((order) => order.id === orderId) || null;
  }
  const address = userAddress || getCurrentAddress();
  if (!address) return null;
  const params = new URLSearchParams();
  params.set("userAddress", address);
  const { headers } = await buildAuthHeaders(`orders:read:${orderId}`);
  const res = await fetch(`/api/orders/${orderId}?${params.toString()}`, { headers });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data) return null;
  return normalizeOrder(data as ServerOrder);
}

async function buildAuthHeaders(intent: string, body?: string, addressOverride?: string) {
  const auth = await signAuthIntent(intent, body);
  if (addressOverride && addressOverride !== auth.address) {
    throw new Error("auth address mismatch");
  }
  return {
    auth,
    headers: {
      "x-auth-address": auth.address,
      "x-auth-signature": auth.signature,
      "x-auth-timestamp": String(auth.timestamp),
      "x-auth-nonce": auth.nonce,
      "x-auth-body-sha256": auth.bodyHash,
    } as Record<string, string>,
  };
}

export async function fetchPublicOrders(
  cursor?: string,
  options: { force?: boolean } = {}
): Promise<{ items: LocalOrder[]; nextCursor?: string | null }> {
  if (ORDER_SOURCE !== "server") {
    return { items: loadOrders(), nextCursor: null };
  }
  const cacheKey = cursor ? `cache:orders:public:${cursor}` : "cache:orders:public:first";
  if (!options.force) {
    const cached = readCache<{ items: LocalOrder[]; nextCursor?: string | null }>(cacheKey, 15_000, true);
    if (cached?.fresh) {
      return cached.value;
    }
  }
  const params = new URLSearchParams();
  params.set("pageSize", "30");
  params.set("public", "1");
  if (cursor) params.set("cursor", cursor);
  const res = await fetch(`/api/orders?${params.toString()}`);
  if (!res.ok) return cached?.value ?? { items: [], nextCursor: null };
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const normalized = items.map((item: ServerOrder) => normalizeOrder(item));
  const result = { items: normalized, nextCursor: data?.nextCursor ?? null };
  writeCache(cacheKey, result);
  return result;
}

export async function createOrder(
  payload: LocalOrder & { userAddress?: string; companionAddress?: string; note?: string }
): Promise<{ orderId: string; sent?: boolean; error?: string }> {
  if (ORDER_SOURCE !== "server") {
    addOrder(payload);
    return { orderId: payload.id, sent: true };
  }
  const address = getCurrentAddress();
  const requestBody = {
    user: payload.user,
    userAddress: payload.userAddress || address,
    companionAddress: payload.companionAddress,
    item: payload.item,
    amount: payload.amount,
    status: payload.status,
    note: "note" in payload ? (payload as { note?: string }).note : undefined,
    orderId: payload.id,
    chainDigest: payload.chainDigest,
    serviceFee: payload.serviceFee,
    meta: buildMeta(payload),
  };
  const body = JSON.stringify(requestBody);
  const { auth, headers } = await buildAuthHeaders("orders:create", body);
  if (requestBody.userAddress && requestBody.userAddress !== auth.address) {
    throw new Error("userAddress mismatch");
  }
  const res = await fetch("/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
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

export async function patchOrder(
  orderId: string,
  patch: Partial<LocalOrder> & { userAddress?: string; companionAddress?: string }
) {
  if (ORDER_SOURCE !== "server") {
    updateOrder(orderId, patch);
    return;
  }
  const address = getCurrentAddress();
  const meta = buildMeta(patch);
  const requestBody = {
    userAddress: patch.userAddress || address,
    companionAddress: patch.companionAddress,
    status: patch.status,
    meta,
  };
  const body = JSON.stringify(requestBody);
  const { auth, headers } = await buildAuthHeaders(`orders:patch:${orderId}`, body);
  if (requestBody.userAddress && requestBody.userAddress !== auth.address) {
    throw new Error("userAddress mismatch");
  }
  if (patch.companionAddress && patch.companionAddress !== auth.address) {
    throw new Error("companionAddress mismatch");
  }
  await fetch(`/api/orders/${orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

export async function deleteOrder(orderId: string, userAddress?: string) {
  if (ORDER_SOURCE !== "server") {
    removeOrder(orderId);
    return;
  }
  const address = getCurrentAddress();
  const body = JSON.stringify({ userAddress: userAddress || address, status: "取消" });
  const { auth, headers } = await buildAuthHeaders(`orders:patch:${orderId}`, body);
  if (userAddress && userAddress !== auth.address) {
    throw new Error("userAddress mismatch");
  }
  await fetch(`/api/orders/${orderId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ userAddress: userAddress || auth.address, status: "取消" }),
  });
}

export async function syncChainOrder(orderId: string, userAddress?: string) {
  if (ORDER_SOURCE !== "server") {
    return;
  }
  const address = getCurrentAddress();
  const body = JSON.stringify({ userAddress: userAddress || address });
  const { auth, headers } = await buildAuthHeaders(`orders:chain-sync:${orderId}`, body);
  if (userAddress && userAddress !== auth.address) {
    throw new Error("userAddress mismatch");
  }
  const res = await fetch(`/api/orders/${orderId}/chain-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ userAddress: userAddress || auth.address }),
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
