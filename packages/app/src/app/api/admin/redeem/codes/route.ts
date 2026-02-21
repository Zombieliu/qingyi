import { NextResponse } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { parseBody } from "@/lib/shared/api-validation";
import {
  createRedeemBatch,
  createRedeemCodes,
  normalizeRedeemCode,
  queryRedeemCodes,
} from "@/lib/admin/redeem-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import type { RedeemRewardType } from "@/lib/admin/admin-types";
import { prisma } from "@/lib/db";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function parseDate(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) return new Date(asNumber);
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function randomCode(length: number) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    const idx = crypto.randomInt(0, CODE_CHARS.length);
    out += CODE_CHARS[idx];
  }
  return out;
}

function generateCodes(count: number, length: number, prefix?: string) {
  const normalizedPrefix = prefix ? normalizeRedeemCode(prefix) : "";
  const codes = new Set<string>();
  while (codes.size < count) {
    const code = normalizeRedeemCode(`${normalizedPrefix}${randomCode(length)}`);
    if (code.length >= 6) {
      codes.add(code);
    }
  }
  return Array.from(codes);
}

const createSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  rewardType: z.enum(["mantou", "diamond", "vip", "coupon", "custom"]),
  rewardPayload: z.record(z.string(), z.unknown()).optional(),
  status: z.enum(["active", "disabled"]).default("active"),
  maxRedeem: z.number().int().min(1).max(10_000).optional(),
  maxRedeemPerUser: z.number().int().min(1).max(10_000).optional(),
  startsAt: z.union([z.string(), z.number()]).optional(),
  expiresAt: z.union([z.string(), z.number()]).optional(),
  count: z.number().int().min(1).max(500).optional(),
  codes: z.array(z.string().min(1)).optional(),
  prefix: z.string().optional(),
  codeLength: z.number().int().min(6).max(24).optional(),
});

function validateRewardPayload(type: RedeemRewardType, payload?: Record<string, unknown>) {
  if (type === "mantou" || type === "diamond") {
    const amount = payload?.amount ?? payload?.value;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return "reward amount required";
    }
  }
  if (type === "vip") {
    const days = payload?.days ?? payload?.durationDays ?? payload?.value;
    if (typeof days !== "number" || !Number.isFinite(days) || days <= 0) {
      return "reward days required";
    }
  }
  if (type === "coupon") {
    const couponId = payload?.couponId;
    const couponCode = payload?.couponCode;
    if (!couponId && !couponCode) {
      return "couponId or couponCode required";
    }
  }
  return null;
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const status = searchParams.get("status") || undefined;
  const q = searchParams.get("q") || undefined;
  const batchId = searchParams.get("batchId") || undefined;

  const result = await queryRedeemCodes({ page, pageSize, status, q, batchId });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, createSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const rewardPayload = body.rewardPayload || {};
  const invalid = validateRewardPayload(body.rewardType, rewardPayload);
  if (invalid) {
    return NextResponse.json({ error: invalid }, { status: 400 });
  }

  const startsAt = parseDate(body.startsAt);
  const expiresAt = parseDate(body.expiresAt);

  const count = body.codes?.length ? body.codes.length : body.count || 1;
  const codeLength = body.codeLength || 10;
  const maxRedeem = body.maxRedeem || 1;
  const maxRedeemPerUser = body.maxRedeemPerUser || 1;

  const inputCodes = body.codes?.length
    ? Array.from(
        new Set(
          body.codes.map((code) => normalizeRedeemCode(code)).filter((code) => code.length >= 6)
        )
      )
    : [];

  let codes = inputCodes.length
    ? inputCodes
    : generateCodes(Math.max(1, count), codeLength, body.prefix);

  let existing = await prisma.redeemCode.findMany({
    where: { code: { in: codes } },
    select: { code: true },
  });

  if (!inputCodes.length && existing.length) {
    let attempts = 0;
    while (existing.length && attempts < 5) {
      attempts += 1;
      codes = generateCodes(Math.max(1, count), codeLength, body.prefix);
      existing = await prisma.redeemCode.findMany({
        where: { code: { in: codes } },
        select: { code: true },
      });
    }
  }

  if (existing.length) {
    return NextResponse.json(
      { error: "duplicate_codes", duplicated: existing.map((item) => item.code) },
      { status: 409 }
    );
  }

  const batchId = `RBT-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
  const batch = await createRedeemBatch({
    id: batchId,
    title: body.title.trim(),
    description: body.description?.trim() || undefined,
    rewardType: body.rewardType,
    rewardPayload,
    status: body.status,
    maxRedeem: null,
    maxRedeemPerUser: null,
    startsAt,
    expiresAt,
    totalCodes: codes.length,
  });

  const created = await createRedeemCodes({
    batchId,
    codes,
    status: body.status,
    maxRedeem,
    maxRedeemPerUser,
    startsAt,
    expiresAt,
  });

  await recordAudit(req, auth, "redeem.batch.create", "redeem-batch", batchId, {
    rewardType: body.rewardType,
    count: codes.length,
  });

  return NextResponse.json({
    batch,
    codes: created,
    count: codes.length,
  });
}
