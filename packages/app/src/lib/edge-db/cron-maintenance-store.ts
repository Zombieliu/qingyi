import "server-only";

import { getEdgeDbConfig, toNumber } from "@/lib/edge-db/client";
import { toEdgeDate } from "@/lib/edge-db/date-normalization";
import {
  EDGE_DB_DEFAULT_SCAN_MAX_ROWS,
  EDGE_DB_DEFAULT_SCAN_PAGE_SIZE,
  scanEdgeTableRows,
} from "@/lib/edge-db/scan-utils";

function getRestBaseUrl(baseUrl: string): string {
  if (baseUrl.endsWith("/rest/v1")) return baseUrl;
  return `${baseUrl}/rest/v1`;
}

async function parseEdgeErrorDetail(res: Response): Promise<string> {
  const text = (await res.text().catch(() => "")).slice(0, 240);
  return text || "unknown";
}

async function deleteRowsByFilterEdgeWrite(
  table: string,
  params: URLSearchParams
): Promise<number> {
  const config = getEdgeDbConfig("write");
  if (!config) {
    throw new Error("edge_db_not_configured");
  }

  const url = new URL(`${getRestBaseUrl(config.baseUrl)}/${table}`);
  url.search = params.toString();

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

  const payload = (await res.json().catch(() => null)) as unknown;
  return Array.isArray(payload) ? payload.length : 0;
}

async function scanReadRows<T>(table: string, baseParams: URLSearchParams): Promise<T[]> {
  return scanEdgeTableRows<T>({
    table,
    baseParams,
    pageSize: EDGE_DB_DEFAULT_SCAN_PAGE_SIZE,
    maxRows: EDGE_DB_DEFAULT_SCAN_MAX_ROWS,
  });
}

async function listRowsAfterOffset(table: string, offset: number): Promise<Array<{ id: string }>> {
  return scanEdgeTableRows<{ id: string }>({
    table,
    baseParams: new URLSearchParams({
      select: "id",
      order: "createdAt.desc",
    }),
    authMode: "write",
    startOffset: offset,
    pageSize: EDGE_DB_DEFAULT_SCAN_PAGE_SIZE,
    maxRows: EDGE_DB_DEFAULT_SCAN_MAX_ROWS,
  });
}

async function deleteRowsByIds(table: string, ids: string[]): Promise<number> {
  if (!ids.length) return 0;

  let deleted = 0;
  const chunkSize = 200;
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const params = new URLSearchParams({
      select: "id",
      id: `in.(${chunk.join(",")})`,
    });
    deleted += await deleteRowsByFilterEdgeWrite(table, params);
  }
  return deleted;
}

export async function pruneTableByMaxRowsEdgeWrite(
  table: string,
  maxRows: number
): Promise<number> {
  if (!Number.isFinite(maxRows) || maxRows <= 0) {
    return 0;
  }

  const staleRows = await listRowsAfterOffset(table, maxRows);
  return deleteRowsByIds(
    table,
    staleRows
      .map((row) => row.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0)
  );
}

export async function deleteAdminOrdersBeforeEdgeWrite(cutoff: Date): Promise<number> {
  return deleteRowsByFilterEdgeWrite(
    "AdminOrder",
    new URLSearchParams({ select: "id", createdAt: `lt.${cutoff.toISOString()}` })
  );
}

export async function deleteGrowthEventsBeforeEdgeWrite(cutoff: Date): Promise<number> {
  return deleteRowsByFilterEdgeWrite(
    "GrowthEvent",
    new URLSearchParams({ select: "id", createdAt: `lt.${cutoff.toISOString()}` })
  );
}

export async function deleteUserSessionsBeforeEdgeWrite(cutoff: Date): Promise<number> {
  return deleteRowsByFilterEdgeWrite(
    "UserSession",
    new URLSearchParams({ select: "id", expiresAt: `lt.${cutoff.toISOString()}` })
  );
}

export async function deleteAdminSessionsBeforeEdgeWrite(cutoff: Date): Promise<number> {
  return deleteRowsByFilterEdgeWrite(
    "AdminSession",
    new URLSearchParams({ select: "id", expiresAt: `lt.${cutoff.toISOString()}` })
  );
}

export async function deleteNotificationsBeforeEdgeWrite(cutoff: Date): Promise<number> {
  return deleteRowsByFilterEdgeWrite(
    "Notification",
    new URLSearchParams({ select: "id", createdAt: `lt.${cutoff.toISOString()}` })
  );
}

type ChainReconcileOrderRow = {
  id: string;
  chainStatus: number | string | null;
  stage: string;
  paymentStatus: string | null;
  source: string | null;
  userAddress: string | null;
  companionAddress: string | null;
  serviceFee: number | string | null;
  deposit: number | string | null;
  createdAt: string | number | null;
};

export type ChainReconcileLocalOrderEdgeRead = {
  id: string;
  chainStatus: number | null;
  stage: string;
  paymentStatus: string | null;
  source: string | null;
  userAddress: string | null;
  companionAddress: string | null;
  serviceFee: number;
  deposit: number;
  createdAt: Date;
};

export async function listChainReconcileOrdersEdgeRead(): Promise<
  ChainReconcileLocalOrderEdgeRead[]
> {
  const rows = await scanReadRows<ChainReconcileOrderRow>(
    "AdminOrder",
    new URLSearchParams({
      select:
        "id,chainStatus,stage,paymentStatus,source,userAddress,companionAddress,serviceFee,deposit,createdAt",
      or: "(source.eq.chain,chainStatus.not.is.null)",
    })
  );

  return rows.map((row) => ({
    id: row.id,
    chainStatus: row.chainStatus == null ? null : toNumber(row.chainStatus),
    stage: row.stage,
    paymentStatus: row.paymentStatus,
    source: row.source,
    userAddress: row.userAddress,
    companionAddress: row.companionAddress,
    serviceFee: toNumber(row.serviceFee),
    deposit: toNumber(row.deposit),
    createdAt: toEdgeDate(row.createdAt),
  }));
}

export async function listChainReconcileStatusRowsEdgeRead(): Promise<
  Array<{ id: string; chainStatus: number | null }>
> {
  const rows = await scanReadRows<{ id: string; chainStatus: number | string | null }>(
    "AdminOrder",
    new URLSearchParams({
      select: "id,chainStatus",
      or: "(source.eq.chain,chainStatus.not.is.null)",
    })
  );

  return rows.map((row) => ({
    id: row.id,
    chainStatus: row.chainStatus == null ? null : toNumber(row.chainStatus),
  }));
}
