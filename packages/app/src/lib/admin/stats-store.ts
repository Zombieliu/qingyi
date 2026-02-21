import { prisma } from "./admin-store-utils";

export async function getAdminStats() {
  const [totalOrders, pendingOrders, activePlayers, publishedAnnouncements] = await Promise.all([
    prisma.adminOrder.count(),
    prisma.adminOrder.count({
      where: { stage: { notIn: ["已完成", "已取消"] } },
    }),
    prisma.adminPlayer.count({ where: { status: { not: "停用" } } }),
    prisma.adminAnnouncement.count({ where: { status: "published" } }),
  ]);
  return {
    totalOrders,
    pendingOrders,
    activePlayers,
    publishedAnnouncements,
  };
}
