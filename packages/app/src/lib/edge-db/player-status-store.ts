import "server-only";

import type { AdminPlayer } from "@/lib/admin/admin-types";
import { fetchEdgeRows, getEdgeDbConfig } from "@/lib/edge-db/client";

type PlayerStatusRow = {
  id: string;
  status: string;
};

export type PlayerAddressLookupResult = {
  player: Pick<AdminPlayer, "id" | "status"> | null;
  conflict: boolean;
};

function normalizePlayerAddress(address: string): string {
  return address.trim().toLowerCase();
}

function getRestBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/rest/v1") ? baseUrl : `${baseUrl}/rest/v1`;
}

async function parseEdgeErrorDetail(res: Response): Promise<string> {
  const text = (await res.text().catch(() => "")).slice(0, 240);
  return text || "unknown";
}

function mapPlayerStatusRow(row: PlayerStatusRow): Pick<AdminPlayer, "id" | "status"> {
  return {
    id: row.id,
    status: row.status as AdminPlayer["status"],
  };
}

async function listPlayersByAddressEdge(
  address: string,
  authMode: "read" | "write"
): Promise<PlayerStatusRow[]> {
  const normalized = normalizePlayerAddress(address);
  if (!normalized) return [];

  const params = new URLSearchParams({
    select: "id,status",
    address: `ilike.${normalized}`,
    deletedAt: "is.null",
    order: "createdAt.desc",
    limit: "2",
  });

  return fetchEdgeRows<PlayerStatusRow>("AdminPlayer", params, authMode);
}

export async function getPlayerByAddressEdgeRead(
  address: string
): Promise<PlayerAddressLookupResult> {
  const rows = await listPlayersByAddressEdge(address, "read");
  if (rows.length === 0) return { player: null, conflict: false };
  if (rows.length > 1) return { player: null, conflict: true };
  return { player: mapPlayerStatusRow(rows[0]), conflict: false };
}

export async function updatePlayerStatusByAddressEdgeWrite(
  address: string,
  status: AdminPlayer["status"]
): Promise<PlayerAddressLookupResult> {
  const rows = await listPlayersByAddressEdge(address, "write");
  if (rows.length === 0) return { player: null, conflict: false };
  if (rows.length > 1) return { player: null, conflict: true };

  const config = getEdgeDbConfig("write");
  if (!config) {
    throw new Error("edge_db_not_configured");
  }

  const url = new URL(`${getRestBaseUrl(config.baseUrl)}/AdminPlayer`);
  url.searchParams.set("id", `eq.${rows[0].id}`);
  url.searchParams.set("select", "id,status");

  try {
    const res = await fetch(url.toString(), {
      method: "PATCH",
      headers: {
        apikey: config.apiKey,
        authorization: `Bearer ${config.apiKey}`,
        accept: "application/json",
        "content-type": "application/json",
        prefer: "return=representation",
      },
      body: JSON.stringify({
        status,
        updatedAt: new Date().toISOString(),
      }),
      cache: "no-store",
    });

    if (!res.ok) {
      const detail = await parseEdgeErrorDetail(res);
      throw new Error(`edge_db_request_failed:AdminPlayer:${res.status}:${detail}`);
    }

    const payload = (await res.json().catch(() => null)) as PlayerStatusRow[] | null;
    if (!Array.isArray(payload) || payload.length === 0) {
      return { player: null, conflict: false };
    }

    return { player: mapPlayerStatusRow(payload[0]), conflict: false };
  } catch {
    return { player: null, conflict: false };
  }
}
