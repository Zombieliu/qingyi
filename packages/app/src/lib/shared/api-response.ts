import "server-only";
import { NextResponse } from "next/server";
import crypto from "crypto";

/**
 * 统一 API 错误响应格式
 *
 * 所有 API 错误响应使用一致的 JSON 结构：
 * { error: string, code?: string, traceId: string }
 */

export function apiError(error: string, status: number, opts?: { code?: string }): NextResponse {
  const traceId = crypto.randomBytes(8).toString("hex");
  return NextResponse.json(
    {
      error,
      ...(opts?.code ? { code: opts.code } : {}),
      traceId,
    },
    {
      status,
      headers: { "x-trace-id": traceId },
    }
  );
}

/** 400 Bad Request */
export function apiBadRequest(error: string, code?: string) {
  return apiError(error, 400, { code });
}

/** 401 Unauthorized */
export function apiUnauthorized(error = "unauthorized") {
  return apiError(error, 401);
}

/** 403 Forbidden */
export function apiForbidden(error = "forbidden") {
  return apiError(error, 403);
}

/** 404 Not Found */
export function apiNotFound(error = "not_found") {
  return apiError(error, 404);
}

/** 429 Rate Limited */
export function apiRateLimited(error = "rate_limited") {
  return apiError(error, 429);
}

/** 500 Internal Server Error */
export function apiInternalError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return apiError(msg, 500);
}
