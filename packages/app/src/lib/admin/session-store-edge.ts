import "server-only";

import type { AdminAccessToken, AdminSession } from "./admin-types";
import { fetchEdgeRows, getEdgeDbConfig, insertEdgeRow, toEpochMs } from "@/lib/edge-db/client";

type SessionRow = {
  id: string;
  tokenHash: string;
  role: string;
  label: string | null;
  createdAt: string | number | null;
  expiresAt: string | number | null;
  lastSeenAt: string | number | null;
  ip: string | null;
  userAgent: string | null;
};

type AccessTokenRow = {
  id: string;
  tokenHash: string;
  tokenPrefix: string;
  role: string;
  label: string | null;
  status: string;
  createdAt: string | number | null;
  updatedAt: string | number | null;
  lastUsedAt: string | number | null;
};

function getRestBaseUrl(baseUrl: string): string {
  if (baseUrl.endsWith("/rest/v1")) return baseUrl;
  return `${baseUrl}/rest/v1`;
}

async function parseEdgeErrorDetail(res: Response): Promise<string> {
  const text = (await res.text().catch(() => "")).slice(0, 240);
  return text || "unknown";
}

function mapSession(row: SessionRow): AdminSession {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    role: row.role as AdminSession["role"],
    label: row.label || undefined,
    createdAt: toEpochMs(row.createdAt) ?? 0,
    expiresAt: toEpochMs(row.expiresAt) ?? 0,
    lastSeenAt: toEpochMs(row.lastSeenAt),
    ip: row.ip || undefined,
    userAgent: row.userAgent || undefined,
  };
}

function mapAccessToken(row: AccessTokenRow): AdminAccessToken {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    tokenPrefix: row.tokenPrefix,
    role: row.role as AdminAccessToken["role"],
    label: row.label || undefined,
    status: row.status as AdminAccessToken["status"],
    createdAt: toEpochMs(row.createdAt) ?? 0,
    updatedAt: toEpochMs(row.updatedAt),
    lastUsedAt: toEpochMs(row.lastUsedAt),
  };
}

function normalizeSession(session: AdminSession): AdminSession {
  return {
    ...session,
    label: session.label || undefined,
    lastSeenAt: session.lastSeenAt ?? undefined,
    ip: session.ip || undefined,
    userAgent: session.userAgent || undefined,
  };
}

function hasEdgeReadConfig(): boolean {
  return Boolean(getEdgeDbConfig("read"));
}

function hasEdgeWriteConfig(): boolean {
  return Boolean(getEdgeDbConfig("write"));
}

type LegacySessionStore = {
  createSession(session: AdminSession): Promise<AdminSession>;
  getSessionByHash(tokenHash: string): Promise<AdminSession | null>;
  updateSessionByHash(
    tokenHash: string,
    patch: Partial<AdminSession>
  ): Promise<AdminSession | null>;
  removeSessionByHash(tokenHash: string): Promise<boolean>;
  listAccessTokens(): Promise<AdminAccessToken[]>;
  getAccessTokenByHash(tokenHash: string): Promise<AdminAccessToken | null>;
  addAccessToken(token: AdminAccessToken): Promise<AdminAccessToken>;
  updateAccessToken(
    tokenId: string,
    patch: Partial<AdminAccessToken>
  ): Promise<AdminAccessToken | null>;
  removeAccessToken(tokenId: string): Promise<boolean>;
  touchAccessTokenByHash(tokenHash: string): Promise<boolean>;
};

let legacyStorePromise: Promise<LegacySessionStore> | null = null;

async function loadLegacyStore() {
  legacyStorePromise ??= import("./session-store").then((mod) => mod as LegacySessionStore);
  return legacyStorePromise;
}

async function patchEdgeRowsByFilter<T>(
  table: string,
  filter: URLSearchParams,
  data: Record<string, unknown>
): Promise<T[]> {
  const config = getEdgeDbConfig("write");
  if (!config) {
    throw new Error("edge_db_not_configured");
  }

  const url = new URL(`${getRestBaseUrl(config.baseUrl)}/${table}`);
  url.search = filter.toString();

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      apikey: config.apiKey,
      authorization: `Bearer ${config.apiKey}`,
      accept: "application/json",
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify(data),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await parseEdgeErrorDetail(res);
    throw new Error(`edge_db_request_failed:${table}:${res.status}:${detail}`);
  }

  const payload = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(payload) ? (payload as T[]) : [];
}

async function deleteEdgeRowsByFilter(table: string, filter: URLSearchParams): Promise<number> {
  const config = getEdgeDbConfig("write");
  if (!config) {
    throw new Error("edge_db_not_configured");
  }

  const url = new URL(`${getRestBaseUrl(config.baseUrl)}/${table}`);
  url.search = filter.toString();

  const res = await fetch(url.toString(), {
    method: "DELETE",
    headers: {
      apikey: config.apiKey,
      authorization: `Bearer ${config.apiKey}`,
      accept: "application/json",
      prefer: "return=representation",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await parseEdgeErrorDetail(res);
    throw new Error(`edge_db_request_failed:${table}:${res.status}:${detail}`);
  }

  const payload = (await res.json().catch(() => [])) as unknown;
  return Array.isArray(payload) ? payload.length : 0;
}

export async function createSession(session: AdminSession) {
  if (!hasEdgeWriteConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.createSession(session);
  }

  await insertEdgeRow("AdminSession", {
    id: session.id,
    tokenHash: session.tokenHash,
    role: session.role,
    label: session.label ?? null,
    createdAt: new Date(session.createdAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    lastSeenAt: session.lastSeenAt ? new Date(session.lastSeenAt).toISOString() : null,
    ip: session.ip ?? null,
    userAgent: session.userAgent ?? null,
  });

  return normalizeSession(session);
}

export async function getSessionByHash(tokenHash: string) {
  if (!hasEdgeReadConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.getSessionByHash(tokenHash);
  }

  const rows = await fetchEdgeRows<SessionRow>(
    "AdminSession",
    new URLSearchParams({
      select: "id,tokenHash,role,label,createdAt,expiresAt,lastSeenAt,ip,userAgent",
      tokenHash: `eq.${tokenHash}`,
      limit: "1",
    })
  );
  return rows[0] ? mapSession(rows[0]) : null;
}

export async function updateSessionByHash(tokenHash: string, patch: Partial<AdminSession>) {
  if (!hasEdgeWriteConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.updateSessionByHash(tokenHash, patch);
  }

  const data: Record<string, unknown> = {
    lastSeenAt: new Date(patch.lastSeenAt ?? Date.now()).toISOString(),
  };
  if (patch.role) data.role = patch.role;
  if (patch.label !== undefined) data.label = patch.label ?? null;
  if (patch.expiresAt) data.expiresAt = new Date(patch.expiresAt).toISOString();
  if (patch.ip !== undefined) data.ip = patch.ip ?? null;
  if (patch.userAgent !== undefined) data.userAgent = patch.userAgent ?? null;

  try {
    const rows = await patchEdgeRowsByFilter<SessionRow>(
      "AdminSession",
      new URLSearchParams({
        select: "id,tokenHash,role,label,createdAt,expiresAt,lastSeenAt,ip,userAgent",
        tokenHash: `eq.${tokenHash}`,
      }),
      data
    );
    return rows[0] ? mapSession(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function removeSessionByHash(tokenHash: string) {
  if (!hasEdgeWriteConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.removeSessionByHash(tokenHash);
  }

  try {
    const deleted = await deleteEdgeRowsByFilter(
      "AdminSession",
      new URLSearchParams({ select: "id", tokenHash: `eq.${tokenHash}` })
    );
    return deleted > 0;
  } catch {
    return false;
  }
}

export async function getAccessTokenByHash(tokenHash: string) {
  if (!hasEdgeReadConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.getAccessTokenByHash(tokenHash);
  }

  try {
    const rows = await fetchEdgeRows<AccessTokenRow>(
      "AdminAccessToken",
      new URLSearchParams({
        select: "id,tokenHash,tokenPrefix,role,label,status,createdAt,updatedAt,lastUsedAt",
        tokenHash: `eq.${tokenHash}`,
        limit: "1",
      })
    );
    return rows[0] ? mapAccessToken(rows[0]) : null;
  } catch {
    return null;
  }
}

function normalizeAccessToken(token: AdminAccessToken): AdminAccessToken {
  return {
    ...token,
    label: token.label || undefined,
    updatedAt: token.updatedAt ?? undefined,
    lastUsedAt: token.lastUsedAt ?? undefined,
  };
}

export async function listAccessTokens() {
  if (!hasEdgeReadConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.listAccessTokens();
  }

  const rows = await fetchEdgeRows<AccessTokenRow>(
    "AdminAccessToken",
    new URLSearchParams({
      select: "id,tokenHash,tokenPrefix,role,label,status,createdAt,updatedAt,lastUsedAt",
      order: "createdAt.desc",
      limit: "100",
    })
  );

  return rows.map(mapAccessToken);
}

export async function addAccessToken(token: AdminAccessToken) {
  if (!hasEdgeWriteConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.addAccessToken(token);
  }

  const payload = normalizeAccessToken(token);
  await insertEdgeRow("AdminAccessToken", {
    id: payload.id,
    tokenHash: payload.tokenHash,
    tokenPrefix: payload.tokenPrefix,
    role: payload.role,
    label: payload.label ?? null,
    status: payload.status,
    createdAt: new Date(payload.createdAt).toISOString(),
    updatedAt: payload.updatedAt ? new Date(payload.updatedAt).toISOString() : null,
    lastUsedAt: payload.lastUsedAt ? new Date(payload.lastUsedAt).toISOString() : null,
  });

  return payload;
}

export async function updateAccessToken(tokenId: string, patch: Partial<AdminAccessToken>) {
  if (!hasEdgeWriteConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.updateAccessToken(tokenId, patch);
  }

  const data: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (patch.role !== undefined) data.role = patch.role;
  if (patch.label !== undefined) data.label = patch.label === "" ? null : (patch.label ?? null);
  if (patch.status !== undefined) data.status = patch.status;
  if (patch.lastUsedAt !== undefined) {
    data.lastUsedAt = patch.lastUsedAt ? new Date(patch.lastUsedAt).toISOString() : null;
  }

  try {
    const rows = await patchEdgeRowsByFilter<AccessTokenRow>(
      "AdminAccessToken",
      new URLSearchParams({
        select: "id,tokenHash,tokenPrefix,role,label,status,createdAt,updatedAt,lastUsedAt",
        id: `eq.${tokenId}`,
      }),
      data
    );
    return rows[0] ? mapAccessToken(rows[0]) : null;
  } catch {
    return null;
  }
}

export async function removeAccessToken(tokenId: string) {
  if (!hasEdgeWriteConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.removeAccessToken(tokenId);
  }

  try {
    const deleted = await deleteEdgeRowsByFilter(
      "AdminAccessToken",
      new URLSearchParams({ select: "id", id: `eq.${tokenId}` })
    );
    return deleted > 0;
  } catch {
    return false;
  }
}

export async function touchAccessTokenByHash(tokenHash: string) {
  if (!hasEdgeWriteConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.touchAccessTokenByHash(tokenHash);
  }

  try {
    const nowIso = new Date().toISOString();
    const rows = await patchEdgeRowsByFilter<{ id: string }>(
      "AdminAccessToken",
      new URLSearchParams({ select: "id", tokenHash: `eq.${tokenHash}` }),
      {
        lastUsedAt: nowIso,
        updatedAt: nowIso,
      }
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}
