import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { removeCoupon, updateCoupon } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import type { AdminCoupon } from "@/lib/admin/admin-types";

type RouteContext = { params: Promise<{ couponId: string }> };

function parseDate(value?: string | number | null) {
  if (value === null) return null;
  if (value === undefined || value === "") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  let body: Partial<AdminCoupon> = {};
  try {
    body = (await req.json()) as Partial<AdminCoupon>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { couponId } = await params;
  const updated = await updateCoupon(couponId, {
    title: body.title,
    code: body.code,
    description: body.description,
    discount: body.discount,
    minSpend: body.minSpend,
    status: body.status,
    startsAt: parseDate(body.startsAt),
    expiresAt: parseDate(body.expiresAt),
  });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit(req, auth, "coupons.update", "coupon", couponId, {
    status: updated.status,
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const { couponId } = await params;
  const ok = await removeCoupon(couponId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit(req, auth, "coupons.delete", "coupon", couponId);
  return NextResponse.json({ ok: true });
}
