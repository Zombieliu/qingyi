import "server-only";
import { fetchChainOrdersAdmin, cancelOrderAdmin, type ChainOrder } from "./chain-admin";
import { syncChainOrder } from "./chain-sync";
import * as chainOrderUtils from "./chain-order-utils";

const DEFAULT_AUTO_CANCEL_HOURS = 24;
const DEFAULT_AUTO_CANCEL_MAX = 10;

export type AutoCancelConfig = {
  enabled: boolean;
  hours: number;
  max: number;
};

export function getAutoCancelConfig(): AutoCancelConfig {
  const hoursRaw = process.env.CHAIN_ORDER_AUTO_CANCEL_HOURS;
  const maxRaw = process.env.CHAIN_ORDER_AUTO_CANCEL_MAX;
  const hours = hoursRaw === undefined || hoursRaw === ""
    ? DEFAULT_AUTO_CANCEL_HOURS
    : Number(hoursRaw);
  const max = maxRaw === undefined || maxRaw === ""
    ? DEFAULT_AUTO_CANCEL_MAX
    : Number(maxRaw);
  const enabled = Number.isFinite(hours) && hours > 0;
  return {
    enabled,
    hours: Number.isFinite(hours) ? hours : DEFAULT_AUTO_CANCEL_HOURS,
    max: Number.isFinite(max) && max > 0 ? Math.floor(max) : DEFAULT_AUTO_CANCEL_MAX,
  };
}

export type AutoCancelResult = {
  enabled: boolean;
  hours: number;
  thresholdMs: number;
  total: number;
  candidates: number;
  canceled: number;
  skipped: number;
  failures: Array<{ orderId: string; error: string }>;
  canceledIds: string[];
};

export async function autoCancelChainOrders(options: { dryRun?: boolean; limit?: number } = {}): Promise<AutoCancelResult> {
  const config = getAutoCancelConfig();
  const thresholdMs = config.hours * 60 * 60 * 1000;
  if (!config.enabled || thresholdMs <= 0) {
    return {
      enabled: false,
      hours: config.hours,
      thresholdMs,
      total: 0,
      candidates: 0,
      canceled: 0,
      skipped: 0,
      failures: [],
      canceledIds: [],
    };
  }

  const nowMs = Date.now();
  const orders = await fetchChainOrdersAdmin();
  const limit = Number.isFinite(options.limit) && Number(options.limit) > 0
    ? Math.floor(Number(options.limit))
    : config.max;
  const targets = chainOrderUtils.pickAutoCancelableOrders(orders, nowMs, thresholdMs, limit);

  if (options.dryRun) {
    return {
      enabled: true,
      hours: config.hours,
      thresholdMs,
      total: orders.length,
      candidates: targets.length,
      canceled: 0,
      skipped: targets.length,
      failures: [],
      canceledIds: [],
    };
  }

  let canceled = 0;
  let skipped = 0;
  const failures: Array<{ orderId: string; error: string }> = [];
  const canceledIds: string[] = [];

  for (const order of targets) {
    if (!chainOrderUtils.isChainOrderAutoCancelable(order, nowMs, thresholdMs)) {
      skipped += 1;
      continue;
    }
    try {
      await cancelOrderAdmin(order.orderId);
      await syncChainOrder(order.orderId);
      canceled += 1;
      canceledIds.push(order.orderId);
    } catch (error) {
      failures.push({
        orderId: order.orderId,
        error: (error as Error).message || "cancel failed",
      });
    }
  }

  return {
    enabled: true,
    hours: config.hours,
    thresholdMs,
    total: orders.length,
    candidates: targets.length,
    canceled,
    skipped,
    failures,
    canceledIds,
  };
}

export function countAutoCancelableOrders(orders: ChainOrder[], nowMs: number, thresholdMs: number) {
  if (!Array.isArray(orders)) return 0;
  return orders.filter((order) => chainOrderUtils.isChainOrderAutoCancelable(order, nowMs, thresholdMs)).length;
}
