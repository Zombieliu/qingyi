import "server-only";
import {
  getDuoOrderById,
  addDuoOrder,
  updateDuoOrder,
  releaseDuoSlot,
} from "../admin/duo-order-store";
import type { DuoOrder } from "../admin/admin-types";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { publishOrderEvent } from "../realtime";
import { env } from "@/lib/env";
import { resolveEffectiveChainStatus, deriveOrderStatus } from "./chain-status";
import type { DuoChainOrder } from "./duo-chain";
import type { DuoChainOrderFromDigest } from "./chain-admin";

function toCny(value: string): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Number((num / 100).toFixed(2));
}

function normalizeCompanionAddress(chainCompanion: string) {
  const normalized = normalizeSuiAddress(chainCompanion);
  if (!isValidSuiAddress(normalized)) return null;
  if (normalized === normalizeSuiAddress("0x0")) return null;
  const defaultRaw = env.NEXT_PUBLIC_QY_DEFAULT_COMPANION || "";
  if (defaultRaw) {
    const defaultNormalized = normalizeSuiAddress(defaultRaw);
    if (isValidSuiAddress(defaultNormalized) && defaultNormalized === normalized) return null;
  }
  return normalized;
}
export async function upsertDuoChainOrder(chain: DuoChainOrder) {
  const orderId = chain.orderId;
  const existing = await getDuoOrderById(orderId);
  const serviceFee = toCny(chain.serviceFee);
  const depositPerCompanion = toCny(chain.depositPerCompanion);
  const amount = existing?.amount ?? Number((serviceFee + depositPerCompanion * 2).toFixed(2));

  const effectiveStatus = resolveEffectiveChainStatus(
    existing ? { chainStatus: existing.chainStatus, meta: existing.meta } : null,
    chain.status
  );
  const statusFields = deriveOrderStatus(effectiveStatus);

  const companionA = normalizeCompanionAddress(chain.companionA);
  const companionB = normalizeCompanionAddress(chain.companionB);

  const meta: Record<string, unknown> = {
    ...(existing?.meta || {}),
    chain: {
      status: chain.status,
      teamStatus: chain.teamStatus,
      disputeDeadline: chain.disputeDeadline,
      ruleSetId: chain.ruleSetId,
    },
    duoOrder: true,
  };

  if (existing) {
    const patch: Partial<DuoOrder> = {
      userAddress: chain.user,
      companionAddressA: companionA || undefined,
      companionAddressB: companionB || undefined,
      ...statusFields,
      serviceFee,
      depositPerCompanion,
      teamStatus: chain.teamStatus,
      meta,
    };
    const updated = await updateDuoOrder(orderId, patch);
    if (updated && statusFields.stage !== existing.stage) {
      const eventPayload = {
        type:
          statusFields.stage === "已完成"
            ? "completed"
            : statusFields.stage === "已取消"
              ? "cancelled"
              : "status_change",
        orderId,
        status: statusFields.paymentStatus,
        stage: statusFields.stage,
        timestamp: Date.now(),
      } as const;
      void publishOrderEvent(chain.user, eventPayload);
      if (companionA) void publishOrderEvent(companionA, eventPayload);
      if (companionB && companionB !== companionA) void publishOrderEvent(companionB, eventPayload);
    }
    return updated;
  }

  return addDuoOrder({
    id: orderId,
    user: chain.user,
    userAddress: chain.user,
    companionAddressA: companionA ?? undefined,
    companionAddressB: companionB ?? undefined,
    item: `链上双陪订单 #${orderId}`,
    amount,
    currency: "CNY",
    ...statusFields,
    note: "链上同步",
    source: "chain",
    serviceFee,
    depositPerCompanion,
    teamStatus: chain.teamStatus,
    meta,
    createdAt: Number(chain.createdAt) || Date.now(),
  });
}

/** Handle a DuoSlotReleased event parsed from a transaction digest. */
export async function syncDuoSlotRelease(parsed: DuoChainOrderFromDigest) {
  if (parsed.releasedSlot === undefined) return null;
  const slot: "A" | "B" = parsed.releasedSlot === 0 ? "A" : "B";
  const orderId = parsed.orderId;

  const existing = await getDuoOrderById(orderId);
  if (!existing) return null;

  // Use releaseDuoSlot for atomic DB update
  const updated = await releaseDuoSlot(orderId, slot);
  if (!updated) return null;

  // Notify relevant parties
  const releasedAddr = parsed.releasedCompanion;
  const eventPayload = {
    type: "slot_released" as const,
    orderId,
    stage: updated.stage,
    timestamp: Date.now(),
  };
  if (existing.userAddress) void publishOrderEvent(existing.userAddress, eventPayload);
  if (releasedAddr) void publishOrderEvent(releasedAddr, eventPayload);

  return updated;
}
