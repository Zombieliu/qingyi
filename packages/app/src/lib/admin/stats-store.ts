import { prisma } from "./admin-store-utils";

export async function getAdminStats() {
  const [totalOrders, pendingOrders, activePlayers, publishedAnnouncements, revenueAgg] =
    await Promise.all([
      prisma.adminOrder.count(),
      prisma.adminOrder.count({
        where: { stage: { notIn: ["已完成", "已取消"] } },
      }),
      prisma.adminPlayer.count({ where: { status: { not: "停用" } } }),
      prisma.adminAnnouncement.count({ where: { status: "published" } }),
      prisma.adminOrder.aggregate({
        where: { stage: "已完成" },
        _sum: { amount: true, serviceFee: true },
        _count: true,
      }),
    ]);

  return {
    totalOrders,
    pendingOrders,
    activePlayers,
    publishedAnnouncements,
    completedOrders: revenueAgg._count,
    totalRevenue: Math.round((revenueAgg._sum.amount || 0) * 100) / 100,
    totalServiceFee: Math.round((revenueAgg._sum.serviceFee || 0) * 100) / 100,
  };
}
