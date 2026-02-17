import "server-only";

export type CursorPayload = { createdAt: number; id: string };

function isCursorPayload(value: unknown): value is CursorPayload {
  if (!value || typeof value !== "object") return false;
  const raw = value as { createdAt?: unknown; id?: unknown };
  return typeof raw.createdAt === "number" && typeof raw.id === "string";
}

export function decodeCursorParam(raw?: string | null): CursorPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (isCursorPayload(parsed)) return parsed;
  } catch {
    // ignore invalid cursor
  }
  return null;
}

export function encodeCursorParam(cursor: CursorPayload | null): string | null {
  if (!cursor) return null;
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}
