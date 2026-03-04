import { randomInt } from "@/lib/shared/runtime-crypto";
import type { AdminAuditLog, AdminRole } from "./admin-types";
import { getEdgeDbConfig, insertEdgeRow } from "@/lib/edge-db/client";

type AuditActor = {
  role: AdminRole;
  sessionId?: string;
  authType?: string;
  tokenLabel?: string;
};

type LegacyAuditStore = {
  addAuditLog(entry: AdminAuditLog): Promise<unknown>;
};

let legacyAuditStorePromise: Promise<LegacyAuditStore> | null = null;

async function loadLegacyAuditStore() {
  legacyAuditStorePromise ??= import("./admin-store").then((mod) => mod as LegacyAuditStore);
  return legacyAuditStorePromise;
}

function hasEdgeAuditWriteConfig() {
  return Boolean(getEdgeDbConfig("write"));
}

async function writeAuditLog(entry: AdminAuditLog) {
  if (hasEdgeAuditWriteConfig()) {
    await insertEdgeRow("AdminAuditLog", {
      id: entry.id,
      actorRole: entry.actorRole,
      actorSessionId: entry.actorSessionId ?? null,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      meta: entry.meta ?? null,
      ip: entry.ip ?? null,
      createdAt: new Date(entry.createdAt).toISOString(),
    });
    return;
  }

  const legacy = await loadLegacyAuditStore();
  await legacy.addAuditLog(entry);
}

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
    id: `audit_${Date.now()}_${randomInt(1000, 9999)}`,
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
    await writeAuditLog(entry);
  } catch {
    // ignore audit write failures
  }
}
