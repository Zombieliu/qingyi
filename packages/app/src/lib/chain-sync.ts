import "server-only";
import { fetchChainOrdersAdmin, type ChainOrder } from "./chain-admin";
import { addOrder, getOrderById, updateOrder } from "./admin-store";
import type { AdminOrder } from "./admin-types";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import {
  findChainOrderCached,
  fetchChainOrdersCached,
  clearCache,
  getCacheStats,
} from "./chain-order-cache";

export function mapStage(status: number): AdminOrder["stage"] {
  if (status === 6) return "已取消";
  if (status === 5) return "已完成";
  if (status >= 2) return "进行中";
  if (status === 1) return "已确认";
  return "待处理";
}

export function mapPaymentStatus(status: number): string {
  switch (status) {
    case 0:
      return "未支付";
    case 1:
      return "撮合费已付";
    case 2:
      return "押金已锁定";
    case 3:
      return "待结算";
    case 4:
      return "争议中";
    case 5:
      return "已结算";
    case 6:
      return "已取消";
    default:
      return "未知";
  }
}

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
  if (normalized === "0x0") return null;
  const defaultRaw = process.env.NEXT_PUBLIC_QY_DEFAULT_COMPANION || "";
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
  const meta = buildChainMeta(existing, chain);
  const existingMeta = (existing?.meta || {}) as Record<string, unknown>;
  const preserveCompanion = existingMeta.publicPool === true;
  const preserveAmounts = existingMeta.paymentMode === "diamond_escrow";
  const companionAddress = normalizeCompanionAddress(chain.companion);

  if (existing) {
    const patch: Partial<AdminOrder> = {
      userAddress: chain.user,
      chainStatus: chain.status,
      paymentStatus: mapPaymentStatus(chain.status),
      stage: mapStage(chain.status),
      meta,
    };
    if (!preserveCompanion) {
      patch.companionAddress = companionAddress ?? undefined;
    }
    if (!preserveAmounts) {
      patch.serviceFee = serviceFee;
      patch.deposit = deposit;
    }
    return updateOrder(orderId, patch);
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
    paymentStatus: mapPaymentStatus(chain.status),
    stage: mapStage(chain.status),
    note: "链上同步",
    source: "chain",
    chainStatus: chain.status,
    serviceFee,
    deposit,
    meta,
    createdAt: Number(chain.createdAt) || Date.now(),
  });
}

export async function syncChainOrders() {
  // 强制刷新缓存获取最新订单
  const chainOrders = await fetchChainOrdersCached(true);
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

  return { total: chainOrders.length, created, updated };
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
