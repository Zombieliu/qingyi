import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { addCoupon, queryCoupons, queryCouponsCursor } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseBody } from "@/lib/shared/api-validation";
import type { CouponStatus } from "@/lib/admin/admin-types";
import { decodeCursorParam, encodeCursorParam } from "@/lib/cursor-utils";

const postSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  code: z.string().optional(),
  description: z.string().optional(),
  discount: z.number().optional(),
  minSpend: z.number().optional(),
  status: z.enum(["可用", "停用", "已过期"]).default("可用"),
  startsAt: z.union([z.string(), z.number()]).optional().nullable(),
  expiresAt: z.union([z.string(), z.number()]).optional().nullable(),
});

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
  const cursorRaw = searchParams.get("cursor");
  const cursor = decodeCursorParam(cursorRaw);
  const useCursor = !searchParams.has("page") || cursorRaw !== null;
  if (useCursor) {
    const result = await queryCouponsCursor({
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

  const result = await queryCoupons({ page, pageSize, status, q });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, postSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const coupon = {
    id: body.id || `CPN-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    title: body.title,
    code: body.code,
    description: body.description,
    discount: body.discount,
    minSpend: body.minSpend,
    status: body.status as CouponStatus,
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
