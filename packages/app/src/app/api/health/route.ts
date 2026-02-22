import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * 健康检查端点
 *
 * GET /api/health
 * - 检查应用运行状态
 * - 检查数据库连接
 * - 返回版本和环境信息
 */
export async function GET() {
  const start = Date.now();
  const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};

  // Database check
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { ok: true, ms: Date.now() - dbStart };
  } catch (e) {
    checks.database = { ok: false, error: (e as Error).message };
  }

  const allOk = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    {
      status: allOk ? "healthy" : "degraded",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev",
      environment: process.env.NODE_ENV,
      checks,
      responseMs: Date.now() - start,
    },
    { status: allOk ? 200 : 503 }
  );
}
