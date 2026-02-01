import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { addCoupon, queryCoupons } from "@/lib/admin-store";
import { recordAudit } from "@/lib/admin-audit";
import type { AdminCoupon, CouponStatus } from "@/lib/admin-types";

function parseDate(value?: string | number | null) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const status = searchParams.get("status") || "";
  const q = searchParams.get("q") || "";

  const result = await queryCoupons({ page, pageSize, status, q });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  let body: Partial<AdminCoupon> = {};
  try {
    body = (await req.json()) as Partial<AdminCoupon>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const coupon: AdminCoupon = {
    id: body.id || `CPN-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    title: body.title,
    code: body.code,
    description: body.description,
    discount: body.discount,
    minSpend: body.minSpend,
    status: (body.status as CouponStatus) || "可用",
    startsAt: parseDate(body.startsAt),
    expiresAt: parseDate(body.expiresAt),
    createdAt: Date.now(),
  };

  await addCoupon(coupon);
  await recordAudit(req, auth, "coupons.create", "coupon", coupon.id, {
    title: coupon.title,
    status: coupon.status,
  });

  return NextResponse.json(coupon, { status: 201 });
}
