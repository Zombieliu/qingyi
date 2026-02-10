import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { chainOrderLogger } from "@/lib/chain-order-logger";

/**
 * 链上订单日志查看 API
 *
 * GET /api/admin/chain/logs?level=error&operation=findChainOrder&limit=100
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;

  const url = new URL(req.url);
  const level = url.searchParams.get("level") as "debug" | "info" | "warn" | "error" | null;
  const operation = url.searchParams.get("operation");
  const limit = Number(url.searchParams.get("limit")) || 100;

  const logs = chainOrderLogger.getLogs({
    level: level || undefined,
    operation: operation || undefined,
    limit,
  });

  return NextResponse.json({
    logs,
    count: logs.length,
    filters: {
      level: level || "all",
      operation: operation || "all",
      limit,
    },
    debugEnabled: process.env.CHAIN_ORDER_DEBUG === "true",
  });
}

/**
 * 清空日志
 *
 * DELETE /api/admin/chain/logs
 */
export async function DELETE(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const beforeCount = chainOrderLogger.getLogs().length;
  chainOrderLogger.clearLogs();
  const afterCount = chainOrderLogger.getLogs().length;

  return NextResponse.json({
    message: "日志已清空",
    beforeCount,
    afterCount,
    timestamp: new Date().toISOString(),
  });
}
