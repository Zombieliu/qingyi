import "server-only";
import {
  fetchChainOrdersAdmin,
  fetchChainOrdersAdminWithCursor,
  type ChainOrder,
} from "./chain-admin";
import { addOrder, getOrderById, updateOrder, processReferralReward } from "../admin/admin-store";
import type { AdminOrder } from "../admin/admin-types";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { findChainOrderCached, clearCache, getCacheStats } from "./chain-order-cache";
import { getChainEventCursor, updateChainEventCursor } from "./chain-event-cursor";
import { env } from "@/lib/env";
import {
  mapStage,
  mapPaymentStatus,
  resolveEffectiveChainStatus,
  deriveOrderStatus,
} from "./chain-status";
import { trackChainSyncResult, trackChainSyncFailed } from "@/lib/business-events";

// Re-export for backward compatibility
export { mapStage, mapPaymentStatus };

function toCny(value: string): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Number((num / 100).toFixed(2));
}

function buildChainMeta(existing: AdminOrder | null, chain: ChainOrder) {
  return {
    ...(existing?.meta || {}),
    chain: {
      status: chain.status,
      disputeDeadline: chain.disputeDeadline,
      lastUpdatedMs: chain.lastUpdatedMs,
      ruleSetId: chain.ruleSetId,
      evidenceHash: chain.evidenceHash,
    },
  } as Record<string, unknown>;
}

function normalizeCompanionAddress(chainCompanion: string) {
  const normalized = normalizeSuiAddress(chainCompanion);
  if (!isValidSuiAddress(normalized)) return null;
  if (normalized === normalizeSuiAddress("0x0")) return null;
  const defaultRaw = env.NEXT_PUBLIC_QY_DEFAULT_COMPANION || "";
  if (defaultRaw) {
    const defaultNormalized = normalizeSuiAddress(defaultRaw);
    if (isValidSuiAddress(defaultNormalized) && defaultNormalized === normalized) {
      return null;
    }
  }
  return normalized;
}

export async function upsertChainOrder(chain: ChainOrder) {
  const orderId = chain.orderId;
  const existing = await getOrderById(orderId);
  const serviceFee = toCny(chain.serviceFee);
  const deposit = toCny(chain.deposit);
  const amount = existing?.amount ?? Number((serviceFee + deposit).toFixed(2));

  // Resolve effective status using unified logic
  const effectiveStatus = resolveEffectiveChainStatus(existing, chain.status);
  const shouldPreserveChainMeta = effectiveStatus > chain.status;

  const existingMeta = (existing?.meta || {}) as Record<string, unknown>;
  const existingChainMeta =
    (existingMeta.chain as Record<string, unknown> | undefined) || undefined;

  let meta: Record<string, unknown>;
  if (shouldPreserveChainMeta) {
    meta = {
      ...existingMeta,
      chain: {
        ...(existingChainMeta || {}),
        status: effectiveStatus,
      },
    };
  } else {
    meta = buildChainMeta(existing, chain);
  }

  const preserveAmounts = existingMeta.paymentMode === "diamond_escrow";
  const companionAddress = normalizeCompanionAddress(chain.companion);
  const existingCompanion = existing?.companionAddress
    ? normalizeCompanionAddress(existing.companionAddress)
    : null;
  const hasLocalCompanion = Boolean(existingCompanion);
  const preserveCompanion = hasLocalCompanion && companionAddress === null;

  if (companionAddress === null) {
    meta.publicPool = !hasLocalCompanion;
  } else {
    meta.publicPool = false;
  }

  // Derive all status fields from effectiveStatus
  const statusFields = deriveOrderStatus(effectiveStatus);

  if (existing) {
    const patch: Partial<AdminOrder> = {
      userAddress: chain.user,
      ...statusFields,
      meta,
    };
    if (!preserveCompanion) {
      patch.companionAddress = companionAddress || undefined;
    }
    if (!preserveAmounts) {
      patch.serviceFee = serviceFee;
      patch.deposit = deposit;
    }
    const updated = await updateOrder(orderId, patch);
    if (updated && updated.stage === "已完成" && existing.stage !== "已完成") {
      try {
        await processReferralReward(orderId, chain.user, amount);
      } catch {
        /* non-critical */
      }
    }
    return updated;
  }

  if (companionAddress === null) {
    meta.publicPool = true;
  }

  return addOrder({
    id: orderId,
    user: chain.user,
    userAddress: chain.user,
    companionAddress: companionAddress ?? undefined,
    item: `链上订单 #${orderId}`,
    amount,
    currency: "CNY",
    ...statusFields,
    note: "链上同步",
    source: "chain",
    serviceFee,
    deposit,
    meta,
    createdAt: Number(chain.createdAt) || Date.now(),
  });
}

export async function syncChainOrders() {
  const startMs = Date.now();
  const cursorState = await getChainEventCursor();
  const cursor = cursorState?.cursor ?? null;
  const incremental = Boolean(cursor);

  let result;
  try {
    result = await fetchChainOrdersAdminWithCursor({
      cursor: incremental ? cursor : null,
      order: incremental ? "ascending" : "descending",
    });
  } catch (e) {
    trackChainSyncFailed((e as Error).message);
    throw e;
  }

  const chainOrders = result.orders;
  let created = 0;
  let updated = 0;

  for (const chain of chainOrders) {
    const existing = await getOrderById(chain.orderId);
    await upsertChainOrder(chain);
    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }

  if (result.latestCursor) {
    const shouldUpdate =
      !cursor ||
      cursor.txDigest !== result.latestCursor.txDigest ||
      cursor.eventSeq !== result.latestCursor.eventSeq;
    if (shouldUpdate) {
      await updateChainEventCursor({
        cursor: result.latestCursor,
        lastEventMs: result.latestEventMs || undefined,
      });
    }
  }

  const syncResult = {
    total: chainOrders.length,
    created,
    updated,
    mode: incremental ? "incremental" : "bootstrap",
    durationMs: Date.now() - startMs,
  };

  trackChainSyncResult(syncResult);
  return syncResult;
}

/**
 * 查找链上订单（优化版 - 使用缓存）
 *
 * @param orderId - 订单 ID
 * @param forceRefresh - 是否强制刷新缓存（默认 false）
 * @returns 订单对象或 null
 */
export async function findChainOrder(orderId: string, forceRefresh = false) {
  return findChainOrderCached(orderId, { forceRefresh });
}

/**
 * 查找链上订单（向后兼容的老方法，不使用缓存）
 * 仅用于需要实时数据的场景
 */
export async function findChainOrderDirect(orderId: string) {
  const chainOrders = await fetchChainOrdersAdmin();
  return chainOrders.find((order) => order.orderId === orderId) || null;
}

export async function syncChainOrder(orderId: string) {
  const chain = await findChainOrder(orderId, true); // 强制刷新以获取最新状态
  if (!chain) return null;
  return upsertChainOrder(chain);
}

/**
 * 清除链上订单缓存
 * 用于需要强制刷新的场景
 */
export function clearChainOrderCache() {
  clearCache();
}

/**
 * 获取缓存统计信息
 * 用于监控和调试
 */
export function getChainOrderCacheStats() {
  return getCacheStats();
}

/**
 * 导出缓存查询函数供其他模块使用
 */
export { fetchChainOrdersCached } from "./chain-order-cache";
export { findChainOrderFromDigest } from "./chain-admin";
