import { NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { prisma } from "@/lib/db";

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

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const baseWhere = { companionAddress: auth.address, stage: "已完成" as const };

  const [totalStats, monthStats, todayStats, activeOrders, reviews, player] = await Promise.all([
    // 总计
    prisma.adminOrder.aggregate({
      where: baseWhere,
      _count: { id: true },
      _sum: { amount: true, serviceFee: true },
    }),
    // 本月
    prisma.adminOrder.aggregate({
      where: { ...baseWhere, createdAt: { gte: monthStart } },
      _count: { id: true },
      _sum: { amount: true, serviceFee: true },
    }),
    // 今日
    prisma.adminOrder.aggregate({
      where: { ...baseWhere, createdAt: { gte: todayStart } },
      _count: { id: true },
      _sum: { amount: true },
    }),
    // 进行中订单数
    prisma.adminOrder.count({
      where: {
        companionAddress: auth.address,
        stage: { in: ["已支付", "进行中", "待结算"] },
      },
    }),
    // 评分
    prisma.orderReview.aggregate({
      where: { companionAddress: auth.address },
      _avg: { rating: true },
      _count: { id: true },
    }),
    // 陪练状态
    prisma.adminPlayer.findFirst({
      where: { address: auth.address },
      select: { id: true, name: true, status: true, role: true },
    }),
  ]);

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
