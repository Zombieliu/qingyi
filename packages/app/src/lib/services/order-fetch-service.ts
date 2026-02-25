"use client";

import { loadOrders, type LocalOrder } from "./order-store";
import { readCache, writeCache } from "@/lib/shared/client-cache";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { getCurrentAddress, isChainOrdersEnabled } from "@/lib/chain/qy-chain-lite";
import { normalizeOrder, type ServerOrder, ORDER_SOURCE } from "./order-utils";

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
// __PLACEHOLDER_PUBLIC__

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
