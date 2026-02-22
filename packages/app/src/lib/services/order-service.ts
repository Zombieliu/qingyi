"use client";

import { addOrder, loadOrders, removeOrder, updateOrder, type LocalOrder } from "./order-store";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { getCurrentAddress, isChainOrdersEnabled } from "@/lib/chain/qy-chain";

const ORDER_SOURCE = (() => {
  const explicit = process.env.NEXT_PUBLIC_ORDER_SOURCE;
  const chainEnabled = process.env.NEXT_PUBLIC_CHAIN_ORDERS === "1";
  if (explicit) {
    if (chainEnabled && explicit !== "server") {
      return "server";
    }
    return explicit;
  }
  return chainEnabled ? "server" : "local";
})();

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

  // Determine effective chain status from all sources
  const chainStatus = order.chainStatus ?? chainMeta?.status ?? undefined;

  // Status resolution:
  // - Prefer server-computed displayStatus (single source of truth)
  // - Fallback to legacy meta.status for backward compatibility
  const metaStatus = typeof meta.status === "string" ? meta.status : undefined;
  const status =
    order.displayStatus || metaStatus || order.stage || order.paymentStatus || "待处理";

  const time = typeof meta.time === "string" ? meta.time : new Date(order.createdAt).toISOString();
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

function resolveUserAddress() {
  if (ORDER_SOURCE === "server") return getCurrentAddress();
  return isChainOrdersEnabled() ? getCurrentAddress() : "";
}

type FetchMeta = {
  fromCache: boolean;
  stale: boolean;
  error?: string;
  traceId?: string | null;
};

type FetchOrdersResult = {
  items: LocalOrder[];
  meta: FetchMeta;
};

type FetchPublicOrdersResult = {
  items: LocalOrder[];
  nextCursor?: string | null;
  meta: FetchMeta;
};

export async function fetchOrdersWithMeta(
  options: { force?: boolean } = {}
): Promise<FetchOrdersResult> {
  if (ORDER_SOURCE !== "server") {
    return { items: loadOrders(), meta: { fromCache: true, stale: false } };
  }
  const userAddress = resolveUserAddress();
  if (!userAddress) return { items: [], meta: { fromCache: true, stale: false } };
  const cacheKey = `cache:orders:${userAddress || "local"}`;
  let cached: { value: LocalOrder[]; fresh?: boolean } | null = null;
  if (!options.force) {
    cached = readCache<LocalOrder[]>(cacheKey, 60_000, true);
    if (cached?.fresh) return { items: cached.value, meta: { fromCache: true, stale: false } };
  }
  const params = new URLSearchParams();
  params.set("page", "1");
  params.set("pageSize", "50");
  if (userAddress) params.set("address", userAddress);
  const res = await fetchWithUserAuth(`/api/orders?${params.toString()}`, {}, userAddress);
  if (!res.ok) {
    const hasCache = Boolean(cached?.value);
    return {
      items: cached?.value ?? [],
      meta: {
        fromCache: hasCache,
        stale: hasCache ? !cached?.fresh : false,
        error: `HTTP ${res.status}`,
        traceId: res.headers.get("x-trace-id"),
      },
    };
  }
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const normalized = items.map((item: ServerOrder) => normalizeOrder(item));
  writeCache(cacheKey, normalized);
  return { items: normalized, meta: { fromCache: false, stale: false } };
}

export async function fetchOrders(options: { force?: boolean } = {}): Promise<LocalOrder[]> {
  const result = await fetchOrdersWithMeta(options);
  return result.items;
}

export async function fetchOrderDetail(
  orderId: string,
  userAddress?: string
): Promise<LocalOrder | null> {
  if (!orderId) return null;
  if (ORDER_SOURCE !== "server") {
    return loadOrders().find((order) => order.id === orderId) || null;
  }
  const address = userAddress || getCurrentAddress();
  if (!address) return null;
  const params = new URLSearchParams();
  params.set("userAddress", address);
  const res = await fetchWithUserAuth(`/api/orders/${orderId}?${params.toString()}`, {}, address);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (!data) return null;
  return normalizeOrder(data as ServerOrder);
}

export async function fetchPublicOrders(
  cursor?: string,
  options: { force?: boolean } = {}
): Promise<{ items: LocalOrder[]; nextCursor?: string | null }> {
  const result = await fetchPublicOrdersWithMeta(cursor, options);
  return { items: result.items, nextCursor: result.nextCursor };
}

export async function fetchPublicOrdersWithMeta(
  cursor?: string,
  options: { force?: boolean } = {}
): Promise<FetchPublicOrdersResult> {
  if (ORDER_SOURCE !== "server") {
    return { items: loadOrders(), nextCursor: null, meta: { fromCache: true, stale: false } };
  }
  const address = getCurrentAddress();
  if (!address) {
    return { items: [], nextCursor: null, meta: { fromCache: true, stale: false } };
  }
  const cacheKey = cursor
    ? `cache:orders:public:${address}:${cursor}`
    : `cache:orders:public:${address}:first`;
  let cached: {
    value: { items: LocalOrder[]; nextCursor?: string | null };
    fresh?: boolean;
  } | null = null;
  if (!options.force) {
    cached = readCache<{ items: LocalOrder[]; nextCursor?: string | null }>(cacheKey, 15_000, true);
    if (cached?.fresh) {
      return {
        items: cached.value.items,
        nextCursor: cached.value.nextCursor,
        meta: { fromCache: true, stale: false },
      };
    }
  }
  const params = new URLSearchParams();
  params.set("pageSize", "30");
  params.set("public", "1");
  params.set("address", address);
  if (cursor) params.set("cursor", cursor);
  const res = await fetchWithUserAuth(`/api/orders?${params.toString()}`, {}, address);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      return {
        items: [],
        nextCursor: null,
        meta: { fromCache: false, stale: false, error: `HTTP ${res.status}` },
      };
    }
    const hasCache = Boolean(cached?.value);
    return {
      items: cached?.value.items ?? [],
      nextCursor: cached?.value.nextCursor ?? null,
      meta: {
        fromCache: hasCache,
        stale: hasCache ? !cached?.fresh : false,
        error: `HTTP ${res.status}`,
        traceId: res.headers.get("x-trace-id"),
      },
    };
  }
  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];
  const normalized = items.map((item: ServerOrder) => normalizeOrder(item));
  const result = { items: normalized, nextCursor: data?.nextCursor ?? null };
  writeCache(cacheKey, result);
  return { ...result, meta: { fromCache: false, stale: false } };
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
  if (requestBody.userAddress && address && requestBody.userAddress !== address) {
    throw new Error("userAddress mismatch");
  }
  const res = await fetchWithUserAuth(
    "/api/orders",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
    address
  );
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
  const isCompanionAction = Boolean(patch.companionAddress);
  const requestBody = {
    userAddress: patch.userAddress ?? (isCompanionAction ? undefined : address),
    companionAddress: patch.companionAddress,
    status: patch.status,
    meta,
  };
  const body = JSON.stringify(requestBody);
  if (requestBody.userAddress && address && requestBody.userAddress !== address) {
    throw new Error("userAddress mismatch");
  }
  if (patch.companionAddress && address && patch.companionAddress !== address) {
    throw new Error("companionAddress mismatch");
  }
  const res = await fetchWithUserAuth(
    `/api/orders/${orderId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    },
    address
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data?.message || data?.error;
    throw new Error(
      detail ? `${detail} (HTTP ${res.status})` : `order patch failed (HTTP ${res.status})`
    );
  }
}

export async function deleteOrder(orderId: string, userAddress?: string) {
  if (ORDER_SOURCE !== "server") {
    removeOrder(orderId);
    return;
  }
  const address = getCurrentAddress();
  const body = JSON.stringify({ userAddress: userAddress || address, status: "取消" });
  if (userAddress && address && userAddress !== address) {
    throw new Error("userAddress mismatch");
  }
  await fetchWithUserAuth(
    `/api/orders/${orderId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body,
    },
    address
  );
}

export async function syncChainOrder(orderId: string, userAddress?: string, digest?: string) {
  if (ORDER_SOURCE !== "server") {
    return;
  }
  const address = getCurrentAddress();
  const body = JSON.stringify({ userAddress: userAddress || address, digest });
  if (userAddress && address && userAddress !== address) {
    throw new Error("userAddress mismatch");
  }
  const res = await fetchWithUserAuth(
    `/api/orders/${orderId}/chain-sync`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    },
    address
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    const detail = data?.message || data?.error;
    throw new Error(
      detail ? `${detail} (HTTP ${res.status})` : `chain sync failed (HTTP ${res.status})`
    );
  }
  return res.json();
}

export function isServerOrderEnabled() {
  return ORDER_SOURCE === "server";
}
