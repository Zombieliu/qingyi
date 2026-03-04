import "server-only";

export type EdgeDbConfig = {
  baseUrl: string;
  apiKey: string;
};

type EdgeDbAuthMode = "read" | "write";

function getFirstEnv(...keys: string[]): string | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return null;
}

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function getRestBaseUrl(config: EdgeDbConfig): string {
  if (config.baseUrl.endsWith("/rest/v1")) return config.baseUrl;
  return `${config.baseUrl}/rest/v1`;
}

export function getEdgeDbConfig(authMode: EdgeDbAuthMode = "read"): EdgeDbConfig | null {
  const baseUrl = getFirstEnv("EDGE_DB_REST_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
  const apiKey =
    authMode === "write"
      ? getFirstEnv(
          "EDGE_DB_REST_SERVICE_KEY",
          "SUPABASE_SERVICE_ROLE_KEY",
          "EDGE_DB_REST_KEY",
          "EDGE_DB_REST_ANON_KEY",
          "NEXT_PUBLIC_SUPABASE_ANON_KEY"
        )
      : getFirstEnv(
          "EDGE_DB_REST_ANON_KEY",
          "EDGE_DB_REST_KEY",
          "NEXT_PUBLIC_SUPABASE_ANON_KEY",
          "EDGE_DB_REST_SERVICE_KEY",
          "SUPABASE_SERVICE_ROLE_KEY"
        );

  if (!baseUrl || !apiKey) return null;
  return { baseUrl: stripTrailingSlash(baseUrl), apiKey };
}

async function parseEdgeErrorDetail(res: Response): Promise<string> {
  const text = (await res.text().catch(() => "")).slice(0, 240);
  return text || "unknown";
}

export async function fetchEdgeRows<T>(
  table: string,
  params: URLSearchParams,
  authMode: EdgeDbAuthMode = "read"
): Promise<T[]> {
  const config = getEdgeDbConfig(authMode);
  if (!config) {
    throw new Error("edge_db_not_configured");
  }

  const url = new URL(`${getRestBaseUrl(config)}/${table}`);
  url.search = params.toString();

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      apikey: config.apiKey,
      authorization: `Bearer ${config.apiKey}`,
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await parseEdgeErrorDetail(res);
    throw new Error(`edge_db_request_failed:${table}:${res.status}:${detail}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`edge_db_invalid_payload:${table}`);
  }

  return data as T[];
}

export async function insertEdgeRow(
  table: string,
  row: Record<string, unknown>,
  prefer: "minimal" | "representation" = "minimal"
): Promise<void> {
  const config = getEdgeDbConfig("write");
  if (!config) {
    throw new Error("edge_db_not_configured");
  }

  const url = new URL(`${getRestBaseUrl(config)}/${table}`);

  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      apikey: config.apiKey,
      authorization: `Bearer ${config.apiKey}`,
      accept: "application/json",
      "content-type": "application/json",
      prefer: prefer === "representation" ? "return=representation" : "return=minimal",
    },
    body: JSON.stringify(row),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await parseEdgeErrorDetail(res);
    throw new Error(`edge_db_request_failed:${table}:${res.status}:${detail}`);
  }
}

export function toEpochMs(value: string | number | null | undefined): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}
