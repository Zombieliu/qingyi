import "server-only";

import { getEdgeDbConfig } from "@/lib/edge-db/client";

function getRestHealthUrl(baseUrl: string): string {
  return baseUrl.endsWith("/rest/v1") ? baseUrl : `${baseUrl}/rest/v1`;
}

export async function checkEdgeDatabaseHealthRead(): Promise<void> {
  const config = getEdgeDbConfig("read");
  if (!config) {
    throw new Error("edge_db_not_configured");
  }

  const res = await fetch(getRestHealthUrl(config.baseUrl), {
    method: "GET",
    headers: {
      apikey: config.apiKey,
      authorization: `Bearer ${config.apiKey}`,
      accept: "application/openapi+json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 240) || "unknown";
    throw new Error(`edge_db_healthcheck_failed:${res.status}:${detail}`);
  }
}
