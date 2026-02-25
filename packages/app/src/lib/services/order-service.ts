"use client";

import { addOrder, removeOrder, updateOrder, type LocalOrder } from "./order-store";
import { fetchWithUserAuth } from "@/lib/auth/user-auth-client";
import { getCurrentAddress } from "@/lib/chain/qy-chain-lite";
import { buildMeta, ORDER_SOURCE } from "./order-utils";
import { OrderMessages } from "@/lib/shared/messages";

// 向后兼容 re-export — 工具函数
export { normalizeOrder, buildMeta, isServerOrderEnabled } from "./order-utils";

// 向后兼容 re-export — fetch 函数
export {
  fetchOrdersWithMeta,
  fetchOrders,
  fetchOrderDetail,
  fetchPublicOrders,
  fetchPublicOrdersWithMeta,
} from "./order-fetch-service";

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
    { method: "POST", headers: { "Content-Type": "application/json" }, body },
    address
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || OrderMessages.CREATE_FAILED);
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
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body },
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
  const body = JSON.stringify({
    userAddress: userAddress || address,
    status: OrderMessages.CANCEL_STATUS,
  });
  if (userAddress && address && userAddress !== address) {
    throw new Error("userAddress mismatch");
  }
  await fetchWithUserAuth(
    `/api/orders/${orderId}`,
    { method: "PATCH", headers: { "Content-Type": "application/json" }, body },
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
    { method: "POST", headers: { "Content-Type": "application/json" }, body },
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
