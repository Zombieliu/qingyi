import { NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { getCompanionStatsEdgeRead } from "@/lib/edge-db/companion-read-store";

/**
 * GET /api/companion/stats?address=xxx
 * 陪练端 — 我的统计数据（接单量、收入、评分等）
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = (searchParams.get("address") || "").trim();
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const auth = await requireUserAuth(req, { intent: "companion:stats:read", address });
  if (!auth.ok) return auth.response;

  const { totalStats, monthStats, todayStats, activeOrders, reviews, player } =
    await getCompanionStatsEdgeRead(auth.address);

  return NextResponse.json({
    player: player
      ? { id: player.id, name: player.name, status: player.status, role: player.role }
      : null,
    today: {
      orders: todayStats._count.id ?? 0,
      revenue: Number(todayStats._sum.amount ?? 0),
    },
    month: {
      orders: monthStats._count.id ?? 0,
      revenue: Number(monthStats._sum.amount ?? 0),
      serviceFee: Number(monthStats._sum.serviceFee ?? 0),
    },
    total: {
      orders: totalStats._count.id ?? 0,
      revenue: Number(totalStats._sum.amount ?? 0),
      serviceFee: Number(totalStats._sum.serviceFee ?? 0),
    },
    activeOrders,
    rating: {
      avg: reviews._avg.rating ? Math.round(reviews._avg.rating * 10) / 10 : null,
      count: reviews._count.id ?? 0,
    },
  });
}
