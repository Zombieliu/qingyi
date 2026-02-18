import crypto from "crypto";
import type { AdminAuditLog, AdminRole } from "./admin-types";
import { addAuditLog } from "./admin-store";

type AuditActor = {
  role: AdminRole;
  sessionId?: string;
  authType?: string;
  tokenLabel?: string;
};

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

export async function recordAudit(
  req: Request,
  actor: AuditActor,
  action: string,
  targetType?: string,
  targetId?: string,
  meta?: Record<string, unknown>
) {
  const entry: AdminAuditLog = {
    id: `audit_${Date.now()}_${crypto.randomInt(1000, 9999)}`,
    actorRole: actor.role,
    actorSessionId: actor.sessionId,
    action,
    targetType,
    targetId,
    meta: {
      authType: actor.authType,
      tokenLabel: actor.tokenLabel,
      ...meta,
    },
    ip: getClientIp(req),
    createdAt: Date.now(),
  };
  try {
    await addAuditLog(entry);
  } catch {
    // ignore audit write failures
  }
}
