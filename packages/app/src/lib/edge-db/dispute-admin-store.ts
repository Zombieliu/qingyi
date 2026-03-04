import "server-only";

import {
  fetchEdgeRows,
  getEdgeDbConfig,
  insertEdgeRow,
  patchEdgeRowsByFilter,
  toNumber,
} from "@/lib/edge-db/client";
import { DisputeMessages, OrderMessages } from "@/lib/shared/messages";

const DISPUTE_REASONS = ["service_quality", "no_show", "wrong_service", "overcharge", "other"];
const DISPUTE_STATUSES = [
  "pending",
  "reviewing",
  "resolved_refund",
  "resolved_reject",
  "resolved_partial",
] as const;
const UNRESOLVED_STATUSES = new Set<DisputeStatus>(["pending", "reviewing"]);
const RESOLUTION_TO_STATUS: Record<"refund" | "reject" | "partial", DisputeStatus> = {
  refund: "resolved_refund",
  reject: "resolved_reject",
  partial: "resolved_partial",
};

export type DisputeReason = (typeof DISPUTE_REASONS)[number];
export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export type DisputeRecord = {
  id: string;
  orderId: string;
  userAddress: string;
  reason: DisputeReason;
  description: string;
  evidence?: string[];
  status: DisputeStatus;
  resolution?: string;
  refundAmount?: number;
  reviewerRole?: string;
  createdAt: Date;
  resolvedAt?: Date;
};

export type AdminDisputeItem = {
  order: {
    id: string;
    item: string;
    amount: number;
    stage: string;
    userAddress?: string;
    companionAddress?: string;
  };
  dispute: DisputeRecord;
  source: "table" | "legacy";
};

type LegacyService = {
  listAdminDisputes(params?: {
    includeResolved?: boolean;
    limit?: number;
  }): Promise<AdminDisputeItem[]>;
  resolveDispute(params: {
    orderId: string;
    resolution: "refund" | "reject" | "partial";
    refundAmount?: number;
    note?: string;
    reviewerRole?: string;
  }): Promise<DisputeRecord>;
};

type TimeValue = string | number | null | undefined;

type DisputeRow = {
  id: string;
  orderId: string;
  userAddress: string;
  reason: string;
  description: string;
  evidence: unknown;
  status: string;
  resolution: string | null;
  refundAmount: string | number | null;
  reviewerRole: string | null;
  createdAt: TimeValue;
  resolvedAt: TimeValue;
};

type AdminOrderRow = {
  id: string;
  item: string;
  amount: string | number | null;
  stage: string;
  userAddress: string | null;
  companionAddress: string | null;
  meta: unknown;
};

let legacyServicePromise: Promise<LegacyService> | null = null;

function hasEdgeReadConfig(): boolean {
  return Boolean(getEdgeDbConfig("read"));
}

function hasEdgeWriteConfig(): boolean {
  return Boolean(getEdgeDbConfig("write"));
}

async function loadLegacyService(): Promise<LegacyService> {
  legacyServicePromise ??= import("@/lib/services/dispute-service").then(
    (mod) => mod as unknown as LegacyService
  );
  return legacyServicePromise;
}

function parseDate(input: unknown): Date | undefined {
  if (!input) return undefined;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? undefined : input;
  const parsed = new Date(String(input));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function parseOptionalString(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  return trimmed ? trimmed : undefined;
}

function parseEvidence(input: unknown): string[] | undefined {
  if (!Array.isArray(input)) return undefined;
  const values = input.filter(
    (item): item is string => typeof item === "string" && item.length > 0
  );
  return values.length ? values : undefined;
}

function parseRefundAmount(input: unknown): number | undefined {
  if (input === null || input === undefined) return undefined;
  const numeric = Number(input);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function normalizeDisputeReason(input: unknown): DisputeReason {
  const value = parseOptionalString(input);
  if (value && (DISPUTE_REASONS as readonly string[]).includes(value)) {
    return value as DisputeReason;
  }
  return "other";
}

function normalizeDisputeStatus(input: unknown): DisputeStatus {
  const value = parseOptionalString(input);
  if (value && (DISPUTE_STATUSES as readonly string[]).includes(value)) {
    return value as DisputeStatus;
  }
  return "pending";
}

function toDisputeRecord(row: DisputeRow): DisputeRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    userAddress: row.userAddress,
    reason: normalizeDisputeReason(row.reason),
    description: row.description,
    evidence: parseEvidence(row.evidence),
    status: normalizeDisputeStatus(row.status),
    resolution: parseOptionalString(row.resolution),
    refundAmount: parseRefundAmount(row.refundAmount),
    reviewerRole: parseOptionalString(row.reviewerRole),
    createdAt: parseDate(row.createdAt) || new Date(0),
    resolvedAt: parseDate(row.resolvedAt),
  };
}

function toOrderSummary(order: AdminOrderRow) {
  return {
    id: order.id,
    item: order.item,
    amount: toNumber(order.amount),
    stage: order.stage,
    userAddress: parseOptionalString(order.userAddress) || undefined,
    companionAddress: parseOptionalString(order.companionAddress) || undefined,
  };
}

function parseLegacyDispute(order: {
  id: string;
  userAddress?: string | null;
  meta?: unknown;
}): DisputeRecord | null {
  const meta = (order.meta as Record<string, unknown> | null) || {};
  const rawDispute = meta.dispute;
  if (!rawDispute || typeof rawDispute !== "object") return null;

  const payload = rawDispute as Record<string, unknown>;
  const createdAt = parseDate(payload.createdAt) ?? new Date();
  const resolvedAt = parseDate(payload.resolvedAt);
  const orderId = parseOptionalString(payload.orderId) || order.id;
  const userAddress =
    parseOptionalString(payload.userAddress) || parseOptionalString(order.userAddress) || "unknown";

  return {
    id: parseOptionalString(payload.id) || `DSP-LEGACY-${order.id}`,
    orderId,
    userAddress,
    reason: normalizeDisputeReason(payload.reason),
    description: parseOptionalString(payload.description) || "",
    evidence: parseEvidence(payload.evidence),
    status: normalizeDisputeStatus(payload.status),
    resolution: parseOptionalString(payload.resolution),
    refundAmount: parseRefundAmount(payload.refundAmount),
    reviewerRole: parseOptionalString(payload.reviewerRole),
    createdAt,
    resolvedAt,
  };
}

function toDisputeMetaPayload(dispute: DisputeRecord) {
  return {
    id: dispute.id,
    orderId: dispute.orderId,
    userAddress: dispute.userAddress,
    reason: dispute.reason,
    description: dispute.description,
    evidence: dispute.evidence,
    status: dispute.status,
    resolution: dispute.resolution,
    refundAmount: dispute.refundAmount,
    reviewerRole: dispute.reviewerRole,
    createdAt: dispute.createdAt.toISOString(),
    resolvedAt: dispute.resolvedAt?.toISOString(),
  };
}

function quoteForIn(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function encodeInFilter(values: string[]): string {
  return `(${values.map(quoteForIn).join(",")})`;
}

async function fetchAdminOrdersByIds(orderIds: string[]): Promise<Map<string, AdminOrderRow>> {
  const uniqueIds = [...new Set(orderIds)];
  if (uniqueIds.length === 0) return new Map();

  const rows = await fetchEdgeRows<AdminOrderRow>(
    "AdminOrder",
    new URLSearchParams({
      select: "id,item,amount,stage,userAddress,companionAddress,meta",
      id: `in.${encodeInFilter(uniqueIds)}`,
    })
  );

  return new Map(rows.map((row) => [row.id, row]));
}

export async function listAdminDisputesEdgeRead(params?: {
  includeResolved?: boolean;
  limit?: number;
}): Promise<AdminDisputeItem[]> {
  if (!hasEdgeReadConfig()) {
    const legacy = await loadLegacyService();
    return legacy.listAdminDisputes(params);
  }

  const includeResolved = params?.includeResolved ?? false;
  const limit = Math.max(1, Math.min(params?.limit ?? 50, 200));

  const disputeQuery = new URLSearchParams({
    select:
      "id,orderId,userAddress,reason,description,evidence,status,resolution,refundAmount,reviewerRole,createdAt,resolvedAt",
    order: "createdAt.desc",
    limit: String(limit),
  });
  if (!includeResolved) {
    disputeQuery.set("status", "in.(pending,reviewing)");
  }

  const disputeRows = await fetchEdgeRows<DisputeRow>("Dispute", disputeQuery);
  const orderMap = await fetchAdminOrdersByIds(disputeRows.map((row) => row.orderId));
  const merged = new Map<string, AdminDisputeItem>();

  for (const row of disputeRows) {
    const order = orderMap.get(row.orderId);
    if (!order) continue;
    merged.set(row.orderId, {
      order: toOrderSummary(order),
      dispute: toDisputeRecord(row),
      source: "table",
    });
  }

  const legacyOrderQuery = new URLSearchParams({
    select: "id,item,amount,stage,userAddress,companionAddress,meta",
    order: "updatedAt.desc",
    limit: String(limit),
  });
  if (!includeResolved) {
    legacyOrderQuery.set("stage", "eq.争议中");
  }

  const legacyOrders = await fetchEdgeRows<AdminOrderRow>("AdminOrder", legacyOrderQuery);
  for (const order of legacyOrders) {
    if (merged.has(order.id)) continue;
    const legacy = parseLegacyDispute(order);
    if (!legacy) continue;
    if (!includeResolved && !UNRESOLVED_STATUSES.has(legacy.status)) continue;
    merged.set(order.id, {
      order: toOrderSummary(order),
      dispute: legacy,
      source: "legacy",
    });
  }

  return Array.from(merged.values())
    .sort((a, b) => b.dispute.createdAt.getTime() - a.dispute.createdAt.getTime())
    .slice(0, limit);
}

export async function resolveDisputeEdgeWrite(params: {
  orderId: string;
  resolution: "refund" | "reject" | "partial";
  refundAmount?: number;
  note?: string;
  reviewerRole?: string;
}): Promise<DisputeRecord> {
  if (!hasEdgeReadConfig() || !hasEdgeWriteConfig()) {
    const legacy = await loadLegacyService();
    return legacy.resolveDispute(params);
  }

  const [order] = await fetchEdgeRows<AdminOrderRow>(
    "AdminOrder",
    new URLSearchParams({
      select: "id,item,amount,stage,userAddress,companionAddress,meta",
      id: `eq.${params.orderId}`,
      limit: "1",
    })
  );
  if (!order) {
    throw new Error(OrderMessages.NOT_FOUND);
  }

  const [storedDispute] = await fetchEdgeRows<DisputeRow>(
    "Dispute",
    new URLSearchParams({
      select:
        "id,orderId,userAddress,reason,description,evidence,status,resolution,refundAmount,reviewerRole,createdAt,resolvedAt",
      orderId: `eq.${params.orderId}`,
      limit: "1",
    })
  );

  const baseDispute =
    (storedDispute ? toDisputeRecord(storedDispute) : parseLegacyDispute(order)) ?? null;
  if (!baseDispute) {
    throw new Error(DisputeMessages.NO_DISPUTE_RECORD);
  }

  const resolved: DisputeRecord = {
    ...baseDispute,
    status: RESOLUTION_TO_STATUS[params.resolution],
    resolution: params.note,
    refundAmount:
      params.resolution === "reject" ? 0 : (params.refundAmount ?? toNumber(order.amount)),
    reviewerRole: params.reviewerRole,
    resolvedAt: new Date(),
  };

  const nowIso = new Date().toISOString();
  const resolvedAtIso = resolved.resolvedAt ? resolved.resolvedAt.toISOString() : null;
  const disputeWritePayload = {
    userAddress: resolved.userAddress,
    reason: resolved.reason,
    description: resolved.description,
    evidence: resolved.evidence ? [...resolved.evidence] : null,
    status: resolved.status,
    resolution: resolved.resolution ?? null,
    refundAmount: resolved.refundAmount ?? null,
    reviewerRole: resolved.reviewerRole ?? null,
    createdAt: resolved.createdAt.toISOString(),
    updatedAt: nowIso,
    resolvedAt: resolvedAtIso,
  };

  if (storedDispute) {
    await patchEdgeRowsByFilter(
      "Dispute",
      new URLSearchParams({
        select: "id",
        orderId: `eq.${params.orderId}`,
      }),
      disputeWritePayload
    );
  } else {
    await insertEdgeRow("Dispute", {
      id: resolved.id,
      orderId: resolved.orderId,
      ...disputeWritePayload,
    });
  }

  const newStage = params.resolution === "reject" ? "已完成" : "已退款";
  const orderMeta = ((order.meta as Record<string, unknown> | null) || {}) as Record<
    string,
    unknown
  >;
  await patchEdgeRowsByFilter(
    "AdminOrder",
    new URLSearchParams({
      select: "id",
      id: `eq.${params.orderId}`,
    }),
    {
      stage: newStage,
      meta: {
        ...orderMeta,
        dispute: toDisputeMetaPayload(resolved),
      },
      updatedAt: nowIso,
    }
  );

  try {
    const { notifyOrderStatusChange } = await import("@/lib/services/notification-service");
    await notifyOrderStatusChange({
      userAddress: resolved.userAddress,
      orderId: params.orderId,
      stage: newStage,
      item: order.item,
    });
  } catch {
    // non-critical notification
  }

  return resolved;
}
