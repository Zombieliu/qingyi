import { NextResponse } from "next/server";
import { checkEdgeDatabaseHealthRead } from "@/lib/edge-db/health-read-store";
import { Redis } from "@upstash/redis";
import { env } from "@/lib/env";
import { withApiHandler } from "@/lib/shared/api-handler";

export const dynamic = "force-dynamic";

const redis = env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN ? Redis.fromEnv() : null;

/**
 * 健康检查端点
 *
 * GET /api/health
 * - 检查应用运行状态
 * - 检查数据库连接
 * - 检查 Redis 连接
 * - 返回版本和环境信息
 */
export const GET = withApiHandler(
  async () => {
    const start = Date.now();
    const checks: Record<string, { ok: boolean; ms?: number; error?: string }> = {};

    // Database check
    try {
      const dbStart = Date.now();
      await checkEdgeDatabaseHealthRead();
      checks.database = { ok: true, ms: Date.now() - dbStart };
    } catch (e) {
      checks.database = { ok: false, error: (e as Error).message };
    }

    // Redis check
    if (redis) {
      try {
        const redisStart = Date.now();
        await redis.ping();
        checks.redis = { ok: true, ms: Date.now() - redisStart };
      } catch (e) {
        checks.redis = { ok: false, error: (e as Error).message };
      }
    } else {
      checks.redis = { ok: false, error: "not_configured" };
    }

    // Redis 不可用不影响整体健康状态，只有数据库等核心服务影响
    const coreChecks = Object.entries(checks)
      .filter(([key]) => key !== "redis")
      .map(([, v]) => v);
    const allCoreOk = coreChecks.every((c) => c.ok);
    const allOk = Object.values(checks).every((c) => c.ok);

    return NextResponse.json(
      {
        status: allCoreOk ? (allOk ? "healthy" : "degraded") : "unhealthy",
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) || "dev",
        environment: process.env.NODE_ENV,
        checks,
        responseMs: Date.now() - start,
      },
      { status: allCoreOk ? 200 : 503 }
    );
  },
  { auth: "public" }
);
