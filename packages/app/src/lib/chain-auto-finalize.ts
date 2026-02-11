import "server-only";
import { fetchChainOrdersAdmin, markCompletedAdmin, finalizeNoDisputeAdmin, type ChainOrder } from "./chain-admin";
import { listOrders } from "./admin-store";
import { syncChainOrder } from "./chain-sync";
import { isChainOrder } from "./order-guard";

const DEFAULT_AUTO_COMPLETE_HOURS = 24;
const DEFAULT_AUTO_COMPLETE_MAX = 10;
const DEFAULT_AUTO_FINALIZE_MAX = 10;

const CHAIN_ORDER_STATUS = {
  DEPOSITED: 2,
  COMPLETED: 3,
};

export type AutoCompleteConfig = {
  enabled: boolean;
  hours: number;
  max: number;
};

export type AutoFinalizeConfig = {
  enabled: boolean;
  max: number;
};

export type AutoCompleteResult = {
  enabled: boolean;
  hours: number;
  thresholdMs: number;
  total: number;
  candidates: number;
  completed: number;
  skipped: number;
  failures: Array<{ orderId: string; error: string }>;
  completedIds: string[];
};

export type AutoFinalizeResult = {
  enabled: boolean;
  total: number;
  candidates: number;
  finalized: number;
  skipped: number;
  failures: Array<{ orderId: string; error: string }>;
  finalizedIds: string[];
};

export type AutoFinalizeSummary = {
  complete: AutoCompleteResult;
  finalize: AutoFinalizeResult;
};

function parseTimestamp(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return num;
}

function getCompanionEndedAt(meta: Record<string, unknown> | undefined): number {
  if (!meta) return 0;
  return parseTimestamp(meta.companionEndedAt);
}

export function getAutoCompleteConfig(): AutoCompleteConfig {
  const hoursRaw = process.env.CHAIN_ORDER_AUTO_COMPLETE_HOURS;
  const maxRaw = process.env.CHAIN_ORDER_AUTO_COMPLETE_MAX;
  const hours = hoursRaw === undefined || hoursRaw === "" ? DEFAULT_AUTO_COMPLETE_HOURS : Number(hoursRaw);
  const max = maxRaw === undefined || maxRaw === "" ? DEFAULT_AUTO_COMPLETE_MAX : Number(maxRaw);
  const enabled = Number.isFinite(hours) && hours > 0;
  return {
    enabled,
    hours: Number.isFinite(hours) ? hours : DEFAULT_AUTO_COMPLETE_HOURS,
    max: Number.isFinite(max) && max > 0 ? Math.floor(max) : DEFAULT_AUTO_COMPLETE_MAX,
  };
}

export function getAutoFinalizeConfig(): AutoFinalizeConfig {
  const maxRaw = process.env.CHAIN_ORDER_AUTO_FINALIZE_MAX;
  const max = maxRaw === undefined || maxRaw === "" ? DEFAULT_AUTO_FINALIZE_MAX : Number(maxRaw);
  const enabled = Number.isFinite(max) && max > 0;
  return {
    enabled,
    max: Number.isFinite(max) && max > 0 ? Math.floor(max) : DEFAULT_AUTO_FINALIZE_MAX,
  };
}

function pickAutoCompleteOrders(
  orders: ChainOrder[],
  companionEndedAtMap: Map<string, number>,
  nowMs: number,
  thresholdMs: number,
  limit: number
) {
  const candidates = orders.filter((order) => {
    if (order.status !== CHAIN_ORDER_STATUS.DEPOSITED) return false;
    if (parseTimestamp(order.finishAt) > 0) return false;
    const endedAt = companionEndedAtMap.get(order.orderId) || 0;
    if (endedAt <= 0) return false;
    return nowMs - endedAt >= thresholdMs;
  });
  return candidates
    .sort((a, b) => {
      const aEnded = companionEndedAtMap.get(a.orderId) || 0;
      const bEnded = companionEndedAtMap.get(b.orderId) || 0;
      return aEnded - bEnded;
    })
    .slice(0, limit);
}

function pickAutoFinalizeOrders(orders: ChainOrder[], nowMs: number, limit: number) {
  const candidates = orders.filter((order) => {
    if (order.status !== CHAIN_ORDER_STATUS.COMPLETED) return false;
    const deadline = parseTimestamp(order.disputeDeadline);
    return deadline > 0 && nowMs > deadline;
  });
  return candidates
    .sort((a, b) => parseTimestamp(a.disputeDeadline) - parseTimestamp(b.disputeDeadline))
    .slice(0, limit);
}

async function buildCompanionEndedAtMap() {
  const orders = await listOrders();
  const map = new Map<string, number>();
  for (const order of orders) {
    if (!isChainOrder(order)) continue;
    const endedAt = getCompanionEndedAt(order.meta);
    if (endedAt > 0) {
      map.set(order.id, endedAt);
    }
  }
  return map;
}

export async function autoCompleteChainOrders(options: { dryRun?: boolean; limit?: number } = {}): Promise<AutoCompleteResult> {
  const config = getAutoCompleteConfig();
  const thresholdMs = config.hours * 60 * 60 * 1000;
  if (!config.enabled || thresholdMs <= 0) {
    return {
      enabled: false,
      hours: config.hours,
      thresholdMs,
      total: 0,
      candidates: 0,
      completed: 0,
      skipped: 0,
      failures: [],
      completedIds: [],
    };
  }

  const nowMs = Date.now();
  const [orders, companionEndedAtMap] = await Promise.all([fetchChainOrdersAdmin(), buildCompanionEndedAtMap()]);
  const limit = Number.isFinite(options.limit) && Number(options.limit) > 0 ? Math.floor(Number(options.limit)) : config.max;
  const targets = pickAutoCompleteOrders(orders, companionEndedAtMap, nowMs, thresholdMs, limit);

  if (options.dryRun) {
    return {
      enabled: true,
      hours: config.hours,
      thresholdMs,
      total: orders.length,
      candidates: targets.length,
      completed: 0,
      skipped: targets.length,
      failures: [],
      completedIds: [],
    };
  }

  let completed = 0;
  let skipped = 0;
  const failures: Array<{ orderId: string; error: string }> = [];
  const completedIds: string[] = [];

  for (const order of targets) {
    try {
      await markCompletedAdmin(order.orderId);
      await syncChainOrder(order.orderId);
      completed += 1;
      completedIds.push(order.orderId);
    } catch (error) {
      failures.push({
        orderId: order.orderId,
        error: (error as Error).message || "mark completed failed",
      });
    }
  }

  skipped = targets.length - completed - failures.length;

  return {
    enabled: true,
    hours: config.hours,
    thresholdMs,
    total: orders.length,
    candidates: targets.length,
    completed,
    skipped,
    failures,
    completedIds,
  };
}

export async function autoFinalizeChainOrders(options: { dryRun?: boolean; limit?: number } = {}): Promise<AutoFinalizeResult> {
  const config = getAutoFinalizeConfig();
  if (!config.enabled) {
    return {
      enabled: false,
      total: 0,
      candidates: 0,
      finalized: 0,
      skipped: 0,
      failures: [],
      finalizedIds: [],
    };
  }

  const nowMs = Date.now();
  const orders = await fetchChainOrdersAdmin();
  const limit = Number.isFinite(options.limit) && Number(options.limit) > 0 ? Math.floor(Number(options.limit)) : config.max;
  const targets = pickAutoFinalizeOrders(orders, nowMs, limit);

  if (options.dryRun) {
    return {
      enabled: true,
      total: orders.length,
      candidates: targets.length,
      finalized: 0,
      skipped: targets.length,
      failures: [],
      finalizedIds: [],
    };
  }

  let finalized = 0;
  let skipped = 0;
  const failures: Array<{ orderId: string; error: string }> = [];
  const finalizedIds: string[] = [];

  for (const order of targets) {
    try {
      await finalizeNoDisputeAdmin(order.orderId);
      await syncChainOrder(order.orderId);
      finalized += 1;
      finalizedIds.push(order.orderId);
    } catch (error) {
      failures.push({
        orderId: order.orderId,
        error: (error as Error).message || "finalize failed",
      });
    }
  }

  skipped = targets.length - finalized - failures.length;

  return {
    enabled: true,
    total: orders.length,
    candidates: targets.length,
    finalized,
    skipped,
    failures,
    finalizedIds,
  };
}

export async function autoFinalizeChainOrdersSummary(options: {
  dryRun?: boolean;
  completeLimit?: number;
  finalizeLimit?: number;
} = {}): Promise<AutoFinalizeSummary> {
  const complete = await autoCompleteChainOrders({ dryRun: options.dryRun, limit: options.completeLimit });
  const finalize = await autoFinalizeChainOrders({ dryRun: options.dryRun, limit: options.finalizeLimit });
  return { complete, finalize };
}
