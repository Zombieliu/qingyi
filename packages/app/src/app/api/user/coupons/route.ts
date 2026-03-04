import { NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/auth/user-auth";

/**
 * GET /api/user/coupons?address=xxx&status=unused|used|expired|all
 * POST /api/user/coupons — claim a coupon { address, couponId }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = (searchParams.get("address") || "").trim();
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const auth = await requireUserAuth(req, { intent: "coupons:read", address });
  if (!auth.ok) return auth.response;

  const status = searchParams.get("status") || "unused";
  const { getUserCoupons } = await import("@/lib/services/coupon-service");
  const coupons = await getUserCoupons(auth.address, status);
  return NextResponse.json({ coupons });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { address?: string; couponId?: string };
  const address = (body.address || "").trim();
  const couponId = (body.couponId || "").trim();

  if (!address || !couponId) {
    return NextResponse.json({ error: "address and couponId required" }, { status: 400 });
  }

  const auth = await requireUserAuth(req, { intent: "coupons:claim", address });
  if (!auth.ok) return auth.response;

  const { claimCoupon } = await import("@/lib/services/coupon-service");
  const result = await claimCoupon(auth.address, couponId);
  if ("error" in result) {
    const statusCode = result.error === "already_claimed" ? 409 : 400;
    return NextResponse.json({ error: result.error }, { status: statusCode });
  }

  return NextResponse.json({ ok: true, coupon: result.userCoupon });
}
