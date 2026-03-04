import { NextResponse } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { setCache } from "@/lib/server-cache";
import { trackCronCompleted, trackCronFailed } from "@/lib/business-events";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BACKUP_CACHE_KEY = "backup:latest";
const BACKUP_TTL_MS = 25 * 60 * 60 * 1000; // 25 hours

/**
 * 数据备份 cron
 *
 * 每天凌晨 3:30 执行：
 * 1. 导出关键业务数据（最近 30 天订单、支付、账本等）
 * 2. 将备份数据存储到 Redis（临时方案）
 * 3. 记录备份统计信息
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const start = Date.now();

  try {
    const { exportCriticalData } = await import("@/lib/shared/backup-utils");
    const data = await exportCriticalData();

    const summary = {
      exportedAt: data.exportedAt,
      stats: data.stats,
      counts: {
        orders: data.orders.length,
        players: data.players.length,
        ledgerRecords: data.ledgerRecords.length,
        payments: data.payments.length,
        mantouWallets: data.mantouWallets.length,
        mantouTransactions: data.mantouTransactions.length,
        referrals: data.referrals.length,
      },
    };

    // 存储备份数据到 Redis
    setCache(BACKUP_CACHE_KEY, data, BACKUP_TTL_MS);
    // 存储备份摘要（轻量，供 admin 查看）
    setCache("backup:summary", summary, BACKUP_TTL_MS);

    const durationMs = Date.now() - start;
    trackCronCompleted("backup", { ...summary.counts, durationMs }, durationMs);

    return NextResponse.json({
      ok: true,
      summary,
      durationMs,
    });
  } catch (error) {
    trackCronFailed("backup", (error as Error).message);
    return NextResponse.json(
      { error: "backup_failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
