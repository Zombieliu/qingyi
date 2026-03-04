import "server-only";

import { fetchEdgeRows, getEdgeDbConfig, insertEdgeRow, toEpochMs } from "@/lib/edge-db/client";

export type UserSessionRecord = {
  id: string;
  tokenHash: string;
  address: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt?: number | null;
  ip?: string | null;
  userAgent?: string | null;
};

type SessionRow = {
  id: string;
  tokenHash: string;
  address: string;
  createdAt: string | number | null;
  expiresAt: string | number | null;
  lastSeenAt: string | number | null;
  ip: string | null;
  userAgent: string | null;
};

function getRestBaseUrl(baseUrl: string): string {
  if (baseUrl.endsWith("/rest/v1")) return baseUrl;
  return `${baseUrl}/rest/v1`;
}

async function parseEdgeErrorDetail(res: Response): Promise<string> {
  const text = (await res.text().catch(() => "")).slice(0, 240);
  return text || "unknown";
}

function mapSession(row: SessionRow): UserSessionRecord {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    address: row.address,
    createdAt: toEpochMs(row.createdAt) ?? 0,
    expiresAt: toEpochMs(row.expiresAt) ?? 0,
    lastSeenAt: toEpochMs(row.lastSeenAt) ?? null,
    ip: row.ip ?? null,
    userAgent: row.userAgent ?? null,
  };
}

function hasEdgeReadConfig(): boolean {
  return Boolean(getEdgeDbConfig("read"));
}

function hasEdgeWriteConfig(): boolean {
  return Boolean(getEdgeDbConfig("write"));
}

type LegacyUserSessionStore = {
  createUserSession(session: UserSessionRecord): Promise<UserSessionRecord>;
  getUserSessionByHash(tokenHash: string): Promise<UserSessionRecord | null>;
  updateUserSessionByHash(
    tokenHash: string,
    patch: Partial<UserSessionRecord>
  ): Promise<UserSessionRecord>;
  removeUserSessionByHash(tokenHash: string): Promise<boolean>;
};

let legacyStorePromise: Promise<LegacyUserSessionStore> | null = null;

async function loadLegacyStore() {
  const modulePath = "./user-session-store";
  legacyStorePromise ??= import(modulePath).then((mod) => mod as LegacyUserSessionStore);
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

export async function createUserSession(session: UserSessionRecord) {
  if (!hasEdgeWriteConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.createUserSession(session);
  }

  await insertEdgeRow("UserSession", {
    id: session.id,
    tokenHash: session.tokenHash,
    address: session.address,
    createdAt: new Date(session.createdAt).toISOString(),
    expiresAt: new Date(session.expiresAt).toISOString(),
    lastSeenAt: session.lastSeenAt ? new Date(session.lastSeenAt).toISOString() : null,
    ip: session.ip ?? null,
    userAgent: session.userAgent ?? null,
  });

  return {
    ...session,
    lastSeenAt: session.lastSeenAt ?? null,
    ip: session.ip ?? null,
    userAgent: session.userAgent ?? null,
  };
}

export async function getUserSessionByHash(tokenHash: string) {
  if (!hasEdgeReadConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.getUserSessionByHash(tokenHash);
  }

  const rows = await fetchEdgeRows<SessionRow>(
    "UserSession",
    new URLSearchParams({
      select: "id,tokenHash,address,createdAt,expiresAt,lastSeenAt,ip,userAgent",
      tokenHash: `eq.${tokenHash}`,
      limit: "1",
    })
  );

  return rows[0] ? mapSession(rows[0]) : null;
}

export async function updateUserSessionByHash(
  tokenHash: string,
  patch: Partial<UserSessionRecord>
) {
  if (!hasEdgeWriteConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.updateUserSessionByHash(tokenHash, patch);
  }

  const data: Record<string, unknown> = {};
  if (patch.expiresAt !== undefined) {
    data.expiresAt = patch.expiresAt ? new Date(patch.expiresAt).toISOString() : null;
  }
  if (patch.lastSeenAt !== undefined) {
    data.lastSeenAt = patch.lastSeenAt ? new Date(patch.lastSeenAt).toISOString() : null;
  }
  if (patch.ip !== undefined) {
    data.ip = patch.ip ?? null;
  }
  if (patch.userAgent !== undefined) {
    data.userAgent = patch.userAgent ?? null;
  }

  const rows = await patchEdgeRowsByFilter<SessionRow>(
    "UserSession",
    new URLSearchParams({
      select: "id,tokenHash,address,createdAt,expiresAt,lastSeenAt,ip,userAgent",
      tokenHash: `eq.${tokenHash}`,
    }),
    data
  );

  const row = rows[0];
  if (!row) {
    throw new Error("user_session_not_found");
  }
  return mapSession(row);
}

export async function removeUserSessionByHash(tokenHash: string) {
  if (!hasEdgeWriteConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.removeUserSessionByHash(tokenHash);
  }

  try {
    const deleted = await deleteEdgeRowsByFilter(
      "UserSession",
      new URLSearchParams({ select: "id", tokenHash: `eq.${tokenHash}` })
    );
    return deleted > 0;
  } catch {
    return false;
  }
}
