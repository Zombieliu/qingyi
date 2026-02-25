import "server-only";
import { NextResponse } from "next/server";
import crypto from "crypto";

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

export function withApiHandler(
  handler: (req: Request, ctx?: unknown) => Promise<NextResponse>,
  options?: ApiHandlerOptions
) {
  return async (req: Request, ctx?: unknown): Promise<NextResponse> => {
    const traceId = crypto.randomBytes(4).toString("hex");
    try {
      const res = await handler(req, ctx);
      if (typeof res.headers?.set === "function") {
        res.headers.set("x-trace-id", traceId);
      }
      return res;
    } catch (error) {
      console.error(`[${traceId}] Unhandled error:`, error);
      return NextResponse.json(
        { error: "internal_error", traceId },
        { status: 500, headers: { "x-trace-id": traceId } }
      );
    }
  };
}
