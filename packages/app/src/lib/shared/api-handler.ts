import "server-only";
import { NextResponse } from "next/server";
import { randomHex } from "@/lib/shared/runtime-crypto";
import { alertOnEdgeRuntimeIncompatibleDb } from "@/lib/services/alert-service";

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

function isEdgeRuntimeIncompatibleError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("Code generation from strings disallowed");
}

export function withApiHandler(
  handler: (req: Request, ctx?: unknown) => Promise<NextResponse>,
  options?: ApiHandlerOptions
) {
  void options;
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
      if (isEdgeRuntimeIncompatibleError(error)) {
        try {
          const path = new URL(req.url).pathname || "/unknown";
          await alertOnEdgeRuntimeIncompatibleDb({
            path,
            method: req.method || "GET",
            role: options?.auth,
            runtime: "edge",
          });
        } catch {
          // alerting should never block fallback response
        }
        return NextResponse.json(
          { error: "edge_runtime_incompatible_db", traceId },
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
