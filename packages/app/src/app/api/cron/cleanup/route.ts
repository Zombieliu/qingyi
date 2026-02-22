import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { trackCronCompleted, trackCronFailed } from "@/lib/business-events";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * 数据清理 cron
 *
 * 每天凌晨 3 点执行：
 * 1. 清理 90 天前的 GrowthEvent（保留聚合数据，删除原始事件）
 * 2. 清理过期的 UserSession
 * 3. 清理过期的 AdminSession
 */
export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  const results: Record<string, number> = {};

  try {
    // 1. Clean old growth events (keep 90 days)
    const growthCutoff = new Date(Date.now() - 90 * 86400_000);
    const growthResult = await prisma.growthEvent.deleteMany({
      where: { createdAt: { lt: growthCutoff } },
    });
    results.growthEvents = growthResult.count;

    // 2. Clean expired user sessions
    const now = new Date();
    const userSessionResult = await prisma.userSession.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    results.userSessions = userSessionResult.count;

    // 3. Clean expired admin sessions
    const adminSessionResult = await prisma.adminSession.deleteMany({
      where: { expiresAt: { lt: now } },
    });
    results.adminSessions = adminSessionResult.count;

    const durationMs = Date.now() - start;
    trackCronCompleted("cleanup", results, durationMs);

    return NextResponse.json({
      ok: true,
      cleaned: results,
      durationMs,
    });
  } catch (error) {
    trackCronFailed("cleanup", (error as Error).message);
    return NextResponse.json(
      { error: "cleanup_failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
