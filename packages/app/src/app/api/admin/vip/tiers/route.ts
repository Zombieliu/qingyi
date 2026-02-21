import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import {
  addMembershipTier,
  queryMembershipTiers,
  queryMembershipTiersCursor,
} from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseBody } from "@/lib/shared/api-validation";
import type { MembershipTierStatus } from "@/lib/admin/admin-types";
import { decodeCursorParam, encodeCursorParam } from "@/lib/cursor-utils";

const perkItemSchema = z.union([
  z.string(),
  z.object({
    label: z.string(),
    desc: z.string().optional(),
  }),
]);

const perksSchema = z.union([z.string(), z.array(perkItemSchema)]).optional();

function parsePerks(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const [label, ...rest] = line.split("|");
    const desc = rest.join("|").trim();
    return desc ? { label: label.trim(), desc } : { label: label.trim() };
  });
}

function normalizePerks(input?: string | Array<string | { label: string; desc?: string }>) {
  if (typeof input === "string") return parsePerks(input);
  if (Array.isArray(input)) {
    return input.map((item) => (typeof item === "string" ? { label: item } : item));
  }
  return undefined;
}

const postSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  level: z.number(),
  badge: z.string().optional(),
  price: z.number().optional(),
  durationDays: z.number().optional(),
  minPoints: z.number().optional(),
  status: z.enum(["上架", "下架"]).default("上架"),
  perks: perksSchema,
});

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const status = searchParams.get("status") || "";
  const q = searchParams.get("q") || "";
  const cursorRaw = searchParams.get("cursor");
  const cursor = decodeCursorParam(cursorRaw);
  const useCursor = !searchParams.has("page") || cursorRaw !== null;
  if (useCursor) {
    const result = await queryMembershipTiersCursor({
      pageSize,
      status: status || undefined,
      q: q || undefined,
      cursor: cursor || undefined,
    });
    return NextResponse.json({
      items: result.items,
      nextCursor: encodeCursorParam(result.nextCursor),
    });
  }

  const result = await queryMembershipTiers({ page, pageSize, status, q });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, postSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const perks = normalizePerks(body.perks);
  const tier = {
    id: body.id || `TIER-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    name: body.name,
    level: body.level,
    badge: body.badge,
    price: body.price,
    durationDays: body.durationDays,
    minPoints: body.minPoints,
    status: body.status as MembershipTierStatus,
    perks,
    createdAt: Date.now(),
  };

  await addMembershipTier(tier);
  await recordAudit(req, auth, "vip.tier.create", "vip-tier", tier.id, {
    name: tier.name,
    level: tier.level,
  });

  return NextResponse.json(tier, { status: 201 });
}
