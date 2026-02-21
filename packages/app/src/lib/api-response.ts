import "server-only";
import { NextResponse } from "next/server";

/**
 * 统一 API 错误响应格式
 *
 * 所有 API 错误响应使用一致的结构：
 * { error: string, message?: string }
 *
 * - error: 机器可读的错误码（snake_case 英文）
 * - message: 可选的人类可读描述
 */

type ErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_address"
  | "invalid_input"
  | "rate_limited"
  | "locked"
  | "conflict"
  | "persist_failed"
  | "internal_error"
  | "ip_forbidden";

const STATUS_MAP: Record<ErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  invalid_address: 400,
  invalid_input: 400,
  rate_limited: 429,
  locked: 429,
  conflict: 409,
  persist_failed: 500,
  internal_error: 500,
  ip_forbidden: 403,
};

export function apiError(code: ErrorCode, message?: string) {
  const status = STATUS_MAP[code] || 500;
  const body: { error: string; message?: string } = { error: code };
  if (message) body.message = message;
  return NextResponse.json(body, { status });
}

export function apiOk<T extends Record<string, unknown>>(data: T) {
  return NextResponse.json(data);
}
