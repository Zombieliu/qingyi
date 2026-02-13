export function formatErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const message = error.message?.trim();
    if (!message) return fallback;
    if (message === fallback) return fallback;
    return `${fallback}：${message}`;
  }
  if (typeof error === "string") {
    const message = error.trim();
    if (!message) return fallback;
    if (message === fallback) return fallback;
    return `${fallback}：${message}`;
  }
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; error?: unknown; code?: unknown; status?: unknown };
    const raw = record.message || record.error || record.code || record.status;
    if (typeof raw === "string" && raw.trim()) {
      const message = raw.trim();
      if (message === fallback) return fallback;
      return `${fallback}：${message}`;
    }
  }
  return fallback;
}

export function extractErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message?.trim() || "";
  }
  if (typeof error === "string") {
    return error.trim();
  }
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; error?: unknown; code?: unknown; status?: unknown };
    const raw = record.message || record.error || record.code || record.status;
    if (typeof raw === "string") return raw.trim();
  }
  return "";
}
