import "server-only";

import { fetchEdgeRows, getEdgeDbConfig } from "@/lib/edge-db/client";

type MiniProgramAccountRow = {
  id: string;
  platform: string;
  openid: string;
  unionid: string | null;
  sessionKey: string | null;
  userAddress: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string | null;
  lastLoginAt: string | null;
};

export type MiniProgramAccountEdgeRead = {
  id: string;
  platform: string;
  openid: string;
  unionid: string | null;
  sessionKey: string | null;
  userAddress: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string | null;
  lastLoginAt: string | null;
};

function getRestBaseUrl(baseUrl: string): string {
  if (baseUrl.endsWith("/rest/v1")) return baseUrl;
  return `${baseUrl}/rest/v1`;
}

async function parseEdgeErrorDetail(res: Response): Promise<string> {
  const text = (await res.text().catch(() => "")).slice(0, 240);
  return text || "unknown";
}

function mapMiniProgramAccount(row: MiniProgramAccountRow): MiniProgramAccountEdgeRead {
  return {
    id: row.id,
    platform: row.platform,
    openid: row.openid,
    unionid: row.unionid,
    sessionKey: row.sessionKey,
    userAddress: row.userAddress,
    phone: row.phone,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastLoginAt: row.lastLoginAt,
  };
}

export async function getMiniProgramAccountByPlatformOpenidEdgeRead(
  platform: string,
  openid: string
): Promise<MiniProgramAccountEdgeRead | null> {
  const rows = await fetchEdgeRows<MiniProgramAccountRow>(
    "MiniProgramAccount",
    new URLSearchParams({
      select:
        "id,platform,openid,unionid,sessionKey,userAddress,phone,createdAt,updatedAt,lastLoginAt",
      platform: `eq.${platform}`,
      openid: `eq.${openid}`,
      limit: "1",
    })
  );

  return rows.length ? mapMiniProgramAccount(rows[0]) : null;
}

export async function updateMiniProgramAccountByPlatformOpenidEdgeWrite(
  platform: string,
  openid: string,
  data: {
    unionid: string | null;
    sessionKey: string;
    phone?: string | null;
    lastLoginAt: Date;
    updatedAt: Date;
  }
): Promise<MiniProgramAccountEdgeRead> {
  const config = getEdgeDbConfig("write");
  if (!config) {
    throw new Error("edge_db_not_configured");
  }

  const url = new URL(`${getRestBaseUrl(config.baseUrl)}/MiniProgramAccount`);
  url.search = new URLSearchParams({
    platform: `eq.${platform}`,
    openid: `eq.${openid}`,
    select:
      "id,platform,openid,unionid,sessionKey,userAddress,phone,createdAt,updatedAt,lastLoginAt",
  }).toString();

  const payload: Record<string, unknown> = {
    unionid: data.unionid,
    sessionKey: data.sessionKey,
    lastLoginAt: data.lastLoginAt.toISOString(),
    updatedAt: data.updatedAt.toISOString(),
  };
  if (data.phone !== undefined) {
    payload.phone = data.phone;
  }

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      apikey: config.apiKey,
      authorization: `Bearer ${config.apiKey}`,
      accept: "application/json",
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await parseEdgeErrorDetail(res);
    throw new Error(`edge_db_request_failed:MiniProgramAccount:${res.status}:${detail}`);
  }

  const rows = (await res.json().catch(() => null)) as MiniProgramAccountRow[] | null;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("edge_db_invalid_payload:MiniProgramAccount");
  }

  return mapMiniProgramAccount(rows[0]);
}

export async function upsertMiniProgramAccountEdgeWrite(args: {
  id: string;
  platform: string;
  openid: string;
  unionid: string | null;
  sessionKey: string;
  userAddress: string;
  phone?: string | null;
  createdAt: Date;
  lastLoginAt: Date;
  updatedAt: Date;
}): Promise<MiniProgramAccountEdgeRead> {
  const config = getEdgeDbConfig("write");
  if (!config) {
    throw new Error("edge_db_not_configured");
  }

  const url = new URL(`${getRestBaseUrl(config.baseUrl)}/MiniProgramAccount`);
  url.search = new URLSearchParams({
    on_conflict: "platform,openid",
    select:
      "id,platform,openid,unionid,sessionKey,userAddress,phone,createdAt,updatedAt,lastLoginAt",
  }).toString();

  const payload: Record<string, unknown> = {
    id: args.id,
    platform: args.platform,
    openid: args.openid,
    unionid: args.unionid,
    sessionKey: args.sessionKey,
    userAddress: args.userAddress,
    createdAt: args.createdAt.toISOString(),
    lastLoginAt: args.lastLoginAt.toISOString(),
    updatedAt: args.updatedAt.toISOString(),
  };
  if (args.phone !== undefined) {
    payload.phone = args.phone;
  }

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      apikey: config.apiKey,
      authorization: `Bearer ${config.apiKey}`,
      accept: "application/json",
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await parseEdgeErrorDetail(res);
    throw new Error(`edge_db_request_failed:MiniProgramAccount:${res.status}:${detail}`);
  }

  const rows = (await res.json().catch(() => null)) as
    | MiniProgramAccountRow[]
    | MiniProgramAccountRow
    | null;
  const first = Array.isArray(rows) ? rows[0] : rows;
  if (!first) {
    throw new Error("edge_db_invalid_payload:MiniProgramAccount");
  }

  return mapMiniProgramAccount(first);
}
