"use client";

import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { getCurrentAddress } from "@/lib/chain/qy-chain-lite";

export async function createDuoOrder(payload: {
  id: string;
  user: string;
  userAddress?: string;
  item: string;
  amount: number;
  note?: string;
  chainDigest?: string;
  serviceFee?: number;
  depositPerCompanion?: number;
  meta?: Record<string, unknown>;
}): Promise<{ orderId: string; sent?: boolean; error?: string }> {
  const address = getCurrentAddress();
  const body = JSON.stringify({
    user: payload.user,
    userAddress: payload.userAddress || address,
    item: payload.item,
    amount: payload.amount,
    note: payload.note,
    orderId: payload.id,
    chainDigest: payload.chainDigest,
    serviceFee: payload.serviceFee,
    depositPerCompanion: payload.depositPerCompanion,
    meta: { ...(payload.meta || {}), duoOrder: true },
  });
  const res = await fetchWithUserAuth(
    "/api/duo-orders",
    { method: "POST", headers: { "Content-Type": "application/json" }, body },
    address
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "创建双陪订单失败");
  return { orderId: data?.orderId || payload.id, sent: data?.sent, error: data?.error };
}

export async function claimDuoSlot(
  orderId: string,
  companionAddress: string
): Promise<Record<string, unknown>> {
  const address = getCurrentAddress();
  const body = JSON.stringify({ companionAddress });
  const res = await fetchWithUserAuth(
    `/api/duo-orders/${orderId}/claim-slot`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body },
    address
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "认领失败");
  return data;
}

export async function patchDuoOrder(orderId: string, patch: Record<string, unknown>) {
  const address = getCurrentAddress();
  const body = JSON.stringify({ ...patch, userAddress: address });
  const res = await fetchWithUserAuth(
    `/api/duo-orders/${orderId}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body },
    address
  );
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || `更新失败 (HTTP ${res.status})`);
  }
  return res.json();
}

export async function fetchDuoOrders(params?: {
  address?: string;
  page?: number;
  pageSize?: number;
  public?: boolean;
  cursor?: string;
}) {
  const address = getCurrentAddress();
  const sp = new URLSearchParams();
  if (params?.address) sp.set("address", params.address);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.pageSize) sp.set("pageSize", String(params.pageSize));
  if (params?.public) sp.set("public", "1");
  if (params?.cursor) sp.set("cursor", params.cursor);
  if (params?.public && !params?.address && address) sp.set("address", address);
  const res = await fetchWithUserAuth(
    `/api/duo-orders?${sp.toString()}`,
    { method: "GET" },
    address
  );
  if (!res.ok) throw new Error("获取双陪订单失败");
  return res.json();
}

export async function releaseDuoSlot(
  orderId: string,
  companionAddress: string,
  chainDigest?: string
): Promise<Record<string, unknown>> {
  const address = getCurrentAddress();
  const body = JSON.stringify({ companionAddress, chainDigest });
  const res = await fetchWithUserAuth(
    `/api/duo-orders/${orderId}/release-slot`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body },
    address
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "释放槽位失败");
  return data;
}

export async function fetchCompanionDuoOrders(params?: {
  address?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}) {
  const address = params?.address || getCurrentAddress();
  const sp = new URLSearchParams({ address });
  if (params?.status) sp.set("status", params.status);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.pageSize) sp.set("pageSize", String(params.pageSize));
  const res = await fetchWithUserAuth(
    `/api/companion/duo-orders?${sp.toString()}`,
    { method: "GET" },
    address
  );
  if (!res.ok) throw new Error("获取陪练双陪订单失败");
  return res.json();
}
