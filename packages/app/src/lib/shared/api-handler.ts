import "server-only";
import { NextResponse } from "next/server";
import { randomHex } from "@/lib/shared/runtime-crypto";

/**
 * API 路由 handler wrapper
 *
 * 提供统一的错误捕获和 traceId 注入，保持轻量不过度设计。
 *
 * 用法：
 * ```ts
 * export const GET = withApiHandler(async (req) => {
 *   return NextResponse.json({ ok: true });
 * });
 * ```
 */

export type ApiHandlerOptions = {
  /** 认证要求（预留，当前不强制执行） */
  auth?: "admin" | "user" | "public";
  /** 可选限流配置（预留） */
  rateLimit?: { max: number; window: string };
};

function isEdgeRuntimeDbError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message || "";
  return (
    msg.includes("Code generation from strings disallowed for this context") ||
    msg.includes("PrismaClient is unable to run in this browser environment")
  );
}

export function withApiHandler(
  handler: (req: Request, ctx?: unknown) => Promise<NextResponse>,
  options?: ApiHandlerOptions
) {
  return async (req: Request, ctx?: unknown): Promise<NextResponse> => {
    const traceId = randomHex(4);
    try {
      const res = await handler(req, ctx);
      if (typeof res.headers?.set === "function") {
        res.headers.set("x-trace-id", traceId);
      }
      return res;
    } catch (error) {
      console.error(`[${traceId}] Unhandled error:`, error);
      if (isEdgeRuntimeDbError(error)) {
        return NextResponse.json(
          {
            error: "edge_runtime_incompatible_db",
            message: "This route is not yet migrated to edge-compatible DB access",
            traceId,
          },
          { status: 503, headers: { "x-trace-id": traceId } }
        );
      }
      return NextResponse.json(
        { error: "internal_error", traceId },
        { status: 500, headers: { "x-trace-id": traceId } }
      );
    }
  };
}
