import "server-only";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  addMember,
  creditMantou,
  getCouponByCode,
  getCouponById,
  getMemberByAddress,
  getMembershipTierById,
  listActiveMembershipTiers,
  updateMember,
} from "@/lib/admin/admin-store";
import { creditLedgerWithAdmin } from "@/lib/ledger/ledger-credit";
import { normalizeRedeemCode } from "@/lib/admin/redeem-store";
import type { RedeemRewardType } from "@/lib/admin/admin-types";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";

type RewardSummary = {
  type: RedeemRewardType;
  amount?: number;
  days?: number;
  tierName?: string;
  coupon?: {
    id: string;
    title: string;
    code?: string;
    discount?: number | null;
    minSpend?: number | null;
    expiresAt?: number | null;
  };
  message?: string;
  digest?: string;
};

type ApplyRewardResult = {
  reward: RewardSummary;
  meta?: Record<string, unknown>;
};

export type RedeemResult =
  | { ok: true; recordId: string; reward: RewardSummary; duplicated?: boolean }
  | { ok: false; error: string; status: number };

class RedeemError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function parsePositiveInt(value: unknown) {
  const num = typeof value === "string" ? Number(value) : value;
  if (typeof num !== "number" || !Number.isFinite(num)) return null;
  const rounded = Math.floor(num);
  return rounded > 0 ? rounded : null;
}

function resolveRewardPayload(
  rewardType: RedeemRewardType,
  raw: Record<string, unknown> | null | undefined
) {
  const payload = raw || {};
  if (rewardType === "mantou" || rewardType === "diamond") {
    const amount = parsePositiveInt(payload.amount ?? payload.value);
    if (!amount) {
      throw new RedeemError("reward_amount_required", 400);
    }
    return { amount };
  }
  if (rewardType === "vip") {
    const days = parsePositiveInt(payload.days ?? payload.durationDays ?? payload.value);
    if (!days) {
      throw new RedeemError("reward_days_required", 400);
    }
    return { days, tierId: typeof payload.tierId === "string" ? payload.tierId : "" };
  }
  if (rewardType === "coupon") {
    const couponId = typeof payload.couponId === "string" ? payload.couponId : "";
    const couponCode = typeof payload.couponCode === "string" ? payload.couponCode : "";
    if (!couponId && !couponCode) {
      throw new RedeemError("reward_coupon_required", 400);
    }
    return { couponId, couponCode };
  }
  if (rewardType === "custom") {
    const message = typeof payload.message === "string" ? payload.message : undefined;
    return { message };
  }
  throw new RedeemError("reward_type_invalid", 400);
}

async function applyReward(params: {
  rewardType: RedeemRewardType;
  rewardPayload: Record<string, unknown> | null | undefined;
  address: string;
  recordId: string;
}): Promise<ApplyRewardResult> {
  const parsed = resolveRewardPayload(params.rewardType, params.rewardPayload);
  if (params.rewardType === "mantou") {
    const amount = (parsed as { amount: number }).amount;
    const result = await creditMantou({
      address: params.address,
      amount,
      orderId: params.recordId,
      note: `卡密兑换 ${params.recordId}`,
    });
    return {
      reward: { type: "mantou", amount },
      meta: {
        mantou: result.wallet,
        transaction: result.transaction,
        duplicated: result.duplicated,
      },
    };
  }

  if (params.rewardType === "diamond") {
    const amount = (parsed as { amount: number }).amount;
    const result = await creditLedgerWithAdmin({
      userAddress: params.address,
      amount,
      receiptId: params.recordId,
      orderId: params.recordId,
      note: `卡密兑换 ${params.recordId}`,
      source: "redeem",
    });
    return {
      reward: { type: "diamond", amount, digest: result.digest },
      meta: { ledger: result },
    };
  }

  if (params.rewardType === "vip") {
    const payload = parsed as { days: number; tierId: string };
    const now = Date.now();
    let tier = payload.tierId ? await getMembershipTierById(payload.tierId) : null;
    if (!tier) {
      const tiers = await listActiveMembershipTiers();
      tier = tiers[0] || null;
    }
    if (!tier) {
      throw new RedeemError("vip_tier_missing", 400);
    }

    const member = await getMemberByAddress(params.address);
    const base = member?.expiresAt && member.expiresAt > now ? member.expiresAt : now;
    const newExpiresAt = base + payload.days * 24 * 60 * 60 * 1000;

    if (member) {
      await updateMember(member.id, {
        tierId: tier.id,
        tierName: tier.name,
        status: "有效",
        expiresAt: newExpiresAt,
      });
    } else {
      await addMember({
        id: `MBR-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
        userAddress: params.address,
        tierId: tier.id,
        tierName: tier.name,
        status: "有效",
        expiresAt: newExpiresAt,
        createdAt: Date.now(),
      });
    }

    return {
      reward: { type: "vip", days: payload.days, tierName: tier.name },
      meta: { expiresAt: newExpiresAt, tierId: tier.id },
    };
  }

  if (params.rewardType === "coupon") {
    const payload = parsed as { couponId: string; couponCode: string };
    const coupon =
      (payload.couponId ? await getCouponById(payload.couponId) : null) ||
      (payload.couponCode ? await getCouponByCode(payload.couponCode) : null);

    if (!coupon) {
      throw new RedeemError("coupon_not_found", 400);
    }
    if (coupon.status !== "可用") {
      throw new RedeemError("coupon_unavailable", 400);
    }
    const now = Date.now();
    if (coupon.startsAt && coupon.startsAt > now) {
      throw new RedeemError("coupon_not_started", 400);
    }
    if (coupon.expiresAt && coupon.expiresAt < now) {
      throw new RedeemError("coupon_expired", 400);
    }

    return {
      reward: {
        type: "coupon",
        coupon: {
          id: coupon.id,
          title: coupon.title,
          code: coupon.code,
          discount: coupon.discount ?? null,
          minSpend: coupon.minSpend ?? null,
          expiresAt: coupon.expiresAt ?? null,
        },
      },
      meta: { couponId: coupon.id },
    };
  }

  const message = (parsed as { message?: string }).message || "兑换成功";
  return {
    reward: { type: "custom", message },
    meta: { message },
  };
}

export async function redeemCodeForUser(params: {
  code: string;
  address: string;
  ip?: string;
  userAgent?: string;
}): Promise<RedeemResult> {
  try {
    const address = normalizeSuiAddress(params.address || "");
    if (!address || !isValidSuiAddress(address)) {
      throw new RedeemError("invalid_address", 400);
    }
    const normalizedCode = normalizeRedeemCode(params.code || "");
    if (!normalizedCode) {
      throw new RedeemError("code_required", 400);
    }

    const recordMetaBase = {
      ip: params.ip || null,
      userAgent: params.userAgent || null,
    };

    const codeRow = await prisma.redeemCode.findUnique({
      where: { code: normalizedCode },
      include: { batch: true },
    });
    if (!codeRow) {
      throw new RedeemError("invalid_code", 404);
    }

    if (codeRow.batch && codeRow.batch.status !== "active") {
      const statusCode = codeRow.batch.status === "disabled" ? 403 : 409;
      throw new RedeemError(`batch_${codeRow.batch.status}`, statusCode);
    }

    if (codeRow.status !== "active") {
      const statusCode = codeRow.status === "disabled" ? 403 : 409;
      throw new RedeemError(`code_${codeRow.status}`, statusCode);
    }

    const now = new Date();
    const startsAt = codeRow.startsAt || codeRow.batch?.startsAt || null;
    const expiresAt = codeRow.expiresAt || codeRow.batch?.expiresAt || null;
    if (startsAt && startsAt.getTime() > now.getTime()) {
      throw new RedeemError("code_not_started", 400);
    }
    if (expiresAt && expiresAt.getTime() < now.getTime()) {
      await prisma.redeemCode.update({
        where: { id: codeRow.id },
        data: { status: "expired", updatedAt: now },
      });
      throw new RedeemError("code_expired", 410);
    }

    const rewardType = (codeRow.rewardType || codeRow.batch?.rewardType) as
      | RedeemRewardType
      | undefined;
    if (!rewardType) {
      throw new RedeemError("reward_missing", 400);
    }

    const rewardPayload = (codeRow.rewardPayload || codeRow.batch?.rewardPayload) as Record<
      string,
      unknown
    > | null;

    const maxRedeem = Math.max(1, codeRow.maxRedeem);
    const maxPerUser = Math.max(1, codeRow.maxRedeemPerUser);

    if (codeRow.usedCount >= maxRedeem) {
      await prisma.redeemCode.update({
        where: { id: codeRow.id },
        data: { status: "exhausted", updatedAt: now },
      });
      throw new RedeemError("code_used_up", 409);
    }

    if (maxPerUser <= 1) {
      const existing = await prisma.redeemRecord.findFirst({
        where: {
          codeId: codeRow.id,
          userAddress: address,
          status: "success",
        },
      });
      if (existing) {
        return {
          ok: true,
          duplicated: true,
          recordId: existing.id,
          reward: { type: rewardType },
        };
      }
    }

    const recordId = `RDM-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
    let reservedRecordId = "";

    await prisma.$transaction(async (tx) => {
      const existingCount = await tx.redeemRecord.count({
        where: {
          codeId: codeRow.id,
          userAddress: address,
          status: { in: ["pending", "success"] },
        },
      });
      if (existingCount >= maxPerUser) {
        throw new RedeemError("user_limit_reached", 409);
      }

      if (codeRow.batchId) {
        if (codeRow.batch?.maxRedeem) {
          const batchUpdated = await tx.redeemBatch.updateMany({
            where: {
              id: codeRow.batchId,
              status: "active",
              usedCount: { lt: codeRow.batch.maxRedeem },
            },
            data: { usedCount: { increment: 1 }, updatedAt: now },
          });
          if (!batchUpdated.count) {
            throw new RedeemError("batch_used_up", 409);
          }
        } else {
          await tx.redeemBatch.update({
            where: { id: codeRow.batchId },
            data: { usedCount: { increment: 1 }, updatedAt: now },
          });
        }
      }

      const updated = await tx.redeemCode.updateMany({
        where: {
          id: codeRow.id,
          status: "active",
          usedCount: { lt: maxRedeem },
        },
        data: { usedCount: { increment: 1 }, updatedAt: now },
      });
      if (!updated.count) {
        throw new RedeemError("code_used_up", 409);
      }

      const record = await tx.redeemRecord.create({
        data: {
          id: recordId,
          codeId: codeRow.id,
          batchId: codeRow.batchId ?? null,
          userAddress: address,
          rewardType,
          rewardPayload: rewardPayload ? (rewardPayload as Prisma.InputJsonValue) : Prisma.DbNull,
          status: "pending",
          createdAt: now,
          ip: recordMetaBase.ip,
          userAgent: recordMetaBase.userAgent,
          meta: Prisma.DbNull,
        },
      });
      reservedRecordId = record.id;
    });

    let rewardResult: Awaited<ReturnType<typeof applyReward>>;
    try {
      rewardResult = await applyReward({
        rewardType,
        rewardPayload,
        address,
        recordId: reservedRecordId,
      });
    } catch (err) {
      const failNow = new Date();
      const message = err instanceof Error ? err.message : "reward_failed";
      await prisma.redeemRecord.update({
        where: { id: reservedRecordId },
        data: {
          status: "failed",
          meta: { error: message } as Prisma.InputJsonValue,
        },
      });
      const shouldExpire = expiresAt && expiresAt.getTime() < failNow.getTime();
      await prisma.redeemCode.update({
        where: { id: codeRow.id },
        data: {
          usedCount: { decrement: 1 },
          status: shouldExpire ? "expired" : "active",
          updatedAt: failNow,
        },
      });
      if (codeRow.batchId) {
        await prisma.redeemBatch.update({
          where: { id: codeRow.batchId },
          data: {
            usedCount: { decrement: 1 },
            status: shouldExpire ? "expired" : "active",
            updatedAt: failNow,
          },
        });
      }
      throw err;
    }

    await prisma.redeemRecord.update({
      where: { id: reservedRecordId },
      data: {
        status: "success",
        meta: rewardResult.meta ? (rewardResult.meta as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });

    const nextUsedCount = codeRow.usedCount + 1;
    const shouldExhaust = nextUsedCount >= maxRedeem;
    await prisma.redeemCode.update({
      where: { id: codeRow.id },
      data: {
        status: shouldExhaust ? "exhausted" : codeRow.status,
        lastRedeemedAt: now,
      },
    });

    if (codeRow.batchId && codeRow.batch?.maxRedeem) {
      const batchUsed = (codeRow.batch.usedCount || 0) + 1;
      const batchExhausted = batchUsed >= codeRow.batch.maxRedeem;
      if (batchExhausted) {
        await prisma.redeemBatch.update({
          where: { id: codeRow.batchId },
          data: { status: "exhausted", updatedAt: now },
        });
      }
    }

    return {
      ok: true,
      recordId: reservedRecordId,
      reward: rewardResult.reward,
    };
  } catch (error) {
    const err = error as RedeemError;
    const status = err instanceof RedeemError ? err.status : 500;
    const message = err instanceof RedeemError ? err.message : "redeem_failed";
    return { ok: false, error: message, status };
  }
}
