import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { addMembershipTier, queryMembershipTiers, queryMembershipTiersCursor } from "@/lib/admin-store";
import { recordAudit } from "@/lib/admin-audit";
import type { AdminMembershipTier, MembershipTierStatus } from "@/lib/admin-types";
import { decodeCursorParam, encodeCursorParam } from "@/lib/cursor-utils";

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

  let body: Partial<AdminMembershipTier> = {};
  try {
    body = (await req.json()) as Partial<AdminMembershipTier>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name || typeof body.level !== "number") {
    return NextResponse.json({ error: "name and level required" }, { status: 400 });
  }

  const tier: AdminMembershipTier = {
    id: body.id || `TIER-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    name: body.name,
    level: body.level,
    badge: body.badge,
    price: body.price,
    durationDays: body.durationDays,
    minPoints: body.minPoints,
    status: (body.status as MembershipTierStatus) || "上架",
    perks: body.perks,
    createdAt: Date.now(),
  };

  await addMembershipTier(tier);
  await recordAudit(req, auth, "vip.tier.create", "vip-tier", tier.id, {
    name: tier.name,
    level: tier.level,
  });

  return NextResponse.json(tier, { status: 201 });
}
