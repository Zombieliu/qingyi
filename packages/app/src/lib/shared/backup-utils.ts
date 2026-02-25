import "server-only";
import { prisma } from "@/lib/db";

export type BackupStats = {
  orders: number;
  players: number;
  ledgerRecords: number;
  userSessions: number;
  payments: number;
  mantouWallets: number;
  mantouTransactions: number;
  referrals: number;
  notifications: number;
  reviews: number;
};

export type BackupData = {
  exportedAt: string;
  stats: BackupStats;
  orders: unknown[];
  players: unknown[];
  ledgerRecords: unknown[];
  payments: unknown[];
  mantouWallets: unknown[];
  mantouTransactions: unknown[];
  referrals: unknown[];
};

/**
 * 获取各表的记录数统计
 */
export async function getBackupStats(): Promise<BackupStats> {
  const [
    orders,
    players,
    ledgerRecords,
    userSessions,
    payments,
    mantouWallets,
    mantouTransactions,
    referrals,
    notifications,
    reviews,
  ] = await Promise.all([
    prisma.adminOrder.count(),
    prisma.adminPlayer.count(),
    prisma.ledgerRecord.count(),
    prisma.userSession.count(),
    prisma.adminPaymentEvent.count(),
    prisma.mantouWallet.count(),
    prisma.mantouTransaction.count(),
    prisma.referral.count(),
    prisma.notification.count(),
    prisma.orderReview.count(),
  ]);

  return {
    orders,
    players,
    ledgerRecords,
    userSessions,
    payments,
    mantouWallets,
    mantouTransactions,
    referrals,
    notifications,
    reviews,
  };
}

/**
 * 导出关键业务数据为 JSON
 *
 * 导出最近 30 天的订单、支付、账本记录，以及全量的陪练和钱包数据。
 */
export async function exportCriticalData(): Promise<BackupData> {
  const since = new Date(Date.now() - 30 * 86400_000);

  const [orders, players, ledgerRecords, payments, mantouWallets, mantouTransactions, referrals] =
    await Promise.all([
      prisma.adminOrder.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.adminPlayer.findMany(),
      prisma.ledgerRecord.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.adminPaymentEvent.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.mantouWallet.findMany(),
      prisma.mantouTransaction.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.referral.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

  const stats = await getBackupStats();

  return {
    exportedAt: new Date().toISOString(),
    stats,
    orders,
    players,
    ledgerRecords,
    payments,
    mantouWallets,
    mantouTransactions,
    referrals,
  };
}
