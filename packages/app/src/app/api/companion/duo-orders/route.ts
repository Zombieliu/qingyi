import { NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { queryCompanionDuoOrdersEdgeRead } from "@/lib/edge-db/companion-read-store";

/**
 * GET /api/companion/duo-orders?address=xxx&status=active|completed|all&page=1&pageSize=20
 * 陪练端 — 我的双陪订单列表
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = (searchParams.get("address") || "").trim();
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const auth = await requireUserAuth(req, { intent: "companion:duo-orders:read", address });
  if (!auth.ok) return auth.response;

  const status = searchParams.get("status") || "active";
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const { total, rows } = await queryCompanionDuoOrdersEdgeRead({
    address: auth.address,
    status,
    page,
    pageSize,
  });

  return NextResponse.json({
    orders: rows,
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  });
}
