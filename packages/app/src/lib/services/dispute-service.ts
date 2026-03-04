import "server-only";
import type { Dispute as PrismaDispute } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { DisputeMessages, OrderMessages } from "@/lib/shared/messages";

function logDispute(event: string, data: Record<string, unknown>) {
  console.log(
    JSON.stringify({ type: "dispute", event, ...data, timestamp: new Date().toISOString() })
  );
}

const DISPUTE_REASONS = ["service_quality", "no_show", "wrong_service", "overcharge", "other"];
const DISPUTE_STATUSES = [
  "pending",
  "reviewing",
  "resolved_refund",
  "resolved_reject",
  "resolved_partial",
] as const;

export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export type DisputeStatus = (typeof DISPUTE_STATUSES)[number];

export type DisputeRecord = {
  id: string;
  orderId: string;
  userAddress: string;
  reason: DisputeReason;
  description: string;
  evidence?: string[]; // 截图 URL
  status: DisputeStatus;
  resolution?: string;
  refundAmount?: number;
  reviewerRole?: string;
  createdAt: Date;
  resolvedAt?: Date;
};

const RESOLUTION_TO_STATUS: Record<"refund" | "reject" | "partial", DisputeStatus> = {
  refund: "resolved_refund",
  reject: "resolved_reject",
  partial: "resolved_partial",
};

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

function parseRefundAmount(input: unknown): number | undefined {
  if (input === null || input === undefined) return undefined;
  const numeric = Number(input);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function toDisputeRecord(row: PrismaDispute): DisputeRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    userAddress: row.userAddress,
    reason: normalizeDisputeReason(row.reason),
    description: row.description,
    evidence: parseEvidence(row.evidence),
    status: normalizeDisputeStatus(row.status),
    resolution: parseOptionalString(row.resolution),
    refundAmount: row.refundAmount === null ? undefined : Number(row.refundAmount),
    reviewerRole: parseOptionalString(row.reviewerRole),
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt ?? undefined,
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

function toDisputeCreateInput(dispute: DisputeRecord) {
  return {
    id: dispute.id,
    orderId: dispute.orderId,
    userAddress: dispute.userAddress,
    reason: dispute.reason,
    description: dispute.description,
    evidence: dispute.evidence ? [...dispute.evidence] : undefined,
    status: dispute.status,
    resolution: dispute.resolution,
    refundAmount: dispute.refundAmount,
    reviewerRole: dispute.reviewerRole,
    createdAt: dispute.createdAt,
    updatedAt: new Date(),
    resolvedAt: dispute.resolvedAt,
  };
}

function toDisputeUpdateInput(dispute: DisputeRecord) {
  return {
    userAddress: dispute.userAddress,
    reason: dispute.reason,
    description: dispute.description,
    evidence: dispute.evidence ? [...dispute.evidence] : undefined,
    status: dispute.status,
    resolution: dispute.resolution,
    refundAmount: dispute.refundAmount,
    reviewerRole: dispute.reviewerRole,
    createdAt: dispute.createdAt,
    updatedAt: new Date(),
    resolvedAt: dispute.resolvedAt ?? null,
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

function createDisputeId() {
  return `DSP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Create a dispute for an order */
export async function createDispute(params: {
  orderId: string;
  userAddress: string;
  reason: DisputeReason;
  description: string;
  evidence?: string[];
}): Promise<DisputeRecord> {
  if (!isFeatureEnabled("dispute_flow")) throw new Error(DisputeMessages.FEATURE_DISABLED);

  const [order, existing] = await Promise.all([
    prisma.adminOrder.findUnique({ where: { id: params.orderId } }),
    prisma.dispute.findUnique({ where: { orderId: params.orderId } }),
  ]);

  if (!order) throw new Error(OrderMessages.NOT_FOUND);
  if (order.userAddress !== params.userAddress) throw new Error(OrderMessages.NO_PERMISSION);
  if (!["已完成", "进行中"].includes(order.stage)) {
    throw new Error(OrderMessages.STAGE_NOT_SUPPORT_DISPUTE);
  }
  if (existing) throw new Error(DisputeMessages.ALREADY_EXISTS);

  const dispute: DisputeRecord = {
    id: createDisputeId(),
    orderId: params.orderId,
    userAddress: params.userAddress,
    reason: params.reason,
    description: params.description,
    evidence: params.evidence,
    status: "pending",
    createdAt: new Date(),
  };

  // Update order stage + persist dispute in one transaction.
  await prisma.$transaction(async (tx) => {
    await tx.dispute.create({ data: toDisputeCreateInput(dispute) });
    await tx.adminOrder.update({
      where: { id: params.orderId },
      data: {
        stage: "争议中",
        meta: {
          ...((order.meta as Record<string, unknown>) || {}),
          dispute: toDisputeMetaPayload(dispute),
        },
      },
    });
  });

  logDispute("dispute_created", {
    orderId: params.orderId,
    reason: params.reason,
    userAddress: params.userAddress,
  });

  // Notify companion (non-critical, outside transaction)
  try {
    const { notifyOrderStatusChange } = await import("@/lib/services/notification-service");
    if (order.companionAddress) {
      await notifyOrderStatusChange({
        userAddress: order.companionAddress!,
        orderId: params.orderId,
        stage: "争议中",
        item: order.item,
      });
    }
  } catch {
    /* notification is best-effort */
  }

  return dispute;
}

/** Resolve a dispute (admin action) */
export async function resolveDispute(params: {
  orderId: string;
  resolution: "refund" | "reject" | "partial";
  refundAmount?: number;
  note?: string;
  reviewerRole?: string;
}): Promise<DisputeRecord> {
  const order = await prisma.adminOrder.findUnique({ where: { id: params.orderId } });
  if (!order) throw new Error(OrderMessages.NOT_FOUND);

  const storedDispute = await prisma.dispute.findUnique({ where: { orderId: params.orderId } });
  const baseDispute =
    (storedDispute ? toDisputeRecord(storedDispute) : parseLegacyDispute(order)) ?? null;
  if (!baseDispute) throw new Error(DisputeMessages.NO_DISPUTE_RECORD);

  const resolved: DisputeRecord = {
    ...baseDispute,
    status: RESOLUTION_TO_STATUS[params.resolution],
    resolution: params.note,
    refundAmount:
      params.resolution === "reject" ? 0 : (params.refundAmount ?? Number(order.amount)),
    reviewerRole: params.reviewerRole,
    resolvedAt: new Date(),
  };

  const newStage = params.resolution === "reject" ? "已完成" : "已退款";

  await prisma.$transaction(async (tx) => {
    await tx.dispute.upsert({
      where: { orderId: params.orderId },
      create: toDisputeCreateInput(resolved),
      update: toDisputeUpdateInput(resolved),
    });

    const orderMeta = (order.meta as Record<string, unknown>) || {};
    await tx.adminOrder.update({
      where: { id: params.orderId },
      data: {
        stage: newStage,
        meta: {
          ...orderMeta,
          dispute: toDisputeMetaPayload(resolved),
        },
      },
    });
  });

  logDispute("dispute_resolved", {
    orderId: params.orderId,
    resolution: params.resolution,
    refundAmount: resolved.refundAmount,
  });

  // Notify user (non-critical, outside transaction)
  try {
    const { notifyOrderStatusChange } = await import("@/lib/services/notification-service");
    await notifyOrderStatusChange({
      userAddress: baseDispute.userAddress,
      orderId: params.orderId,
      stage: newStage,
      item: order.item,
    });
  } catch {
    /* best-effort */
  }

  return resolved;
}

/** Get dispute for an order */
export async function getDispute(orderId: string): Promise<DisputeRecord | null> {
  const row = await prisma.dispute.findUnique({ where: { orderId } });
  if (row) return toDisputeRecord(row);

  const order = await prisma.adminOrder.findUnique({ where: { id: orderId } });
  if (!order) return null;

  const legacy = parseLegacyDispute(order);
  if (!legacy) return null;

  try {
    const saved = await prisma.dispute.upsert({
      where: { orderId },
      create: toDisputeCreateInput(legacy),
      update: toDisputeUpdateInput(legacy),
    });
    return toDisputeRecord(saved);
  } catch {
    return legacy;
  }
}

/** List all disputes for a user */
export async function listUserDisputes(userAddress: string): Promise<DisputeRecord[]> {
  const disputes = await prisma.dispute.findMany({
    where: { userAddress },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const merged = new Map<string, DisputeRecord>();
  for (const row of disputes) {
    const record = toDisputeRecord(row);
    merged.set(record.orderId, record);
  }

  const legacyOrders = await prisma.adminOrder.findMany({
    where: { userAddress },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  for (const order of legacyOrders) {
    const legacy = parseLegacyDispute(order);
    if (legacy && !merged.has(legacy.orderId)) {
      merged.set(legacy.orderId, legacy);
    }
  }

  return Array.from(merged.values())
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 50);
}
