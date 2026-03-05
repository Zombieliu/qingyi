export const EDGE_RUNTIME_INCOMPATIBLE_DB_ERROR = "edge_runtime_incompatible_db";

type ApiErrorPayload = {
  error?: unknown;
  message?: unknown;
};

export type ReconcileApiFailure = {
  code: string;
  message: string;
  status: number;
};

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePayloadError(payload: unknown): Pick<ReconcileApiFailure, "code" | "message"> {
  const body = isObjectRecord(payload) ? (payload as ApiErrorPayload) : {};
  const code = typeof body.error === "string" && body.error ? body.error : "request_failed";
  const message =
    typeof body.message === "string" && body.message.trim().length > 0
      ? body.message
      : "request failed";
  return { code, message };
}

export async function parseReconcileApiFailure(response: Response): Promise<ReconcileApiFailure> {
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // ignore non-json response body
  }
  const parsed = parsePayloadError(payload);
  return {
    code: parsed.code,
    message: parsed.message,
    status: response.status,
  };
}

export function isEdgeRuntimeIncompatibleFailure(failure: ReconcileApiFailure | null): boolean {
  return failure?.code === EDGE_RUNTIME_INCOMPATIBLE_DB_ERROR;
}

export function buildReconcileFailureMessage(failure: ReconcileApiFailure): string {
  if (isEdgeRuntimeIncompatibleFailure(failure)) {
    return "当前环境无法直接执行对账（Edge Runtime 不兼容数据库驱动）。请在 Node Runtime 或兼容 Node 的运行环境重试。";
  }
  return `请求失败（${failure.status}）：${failure.message}`;
}
