import "server-only";

import { fetchEdgeRows, getEdgeDbConfig } from "@/lib/edge-db/client";

type RedeemCodeExistsRow = { code: string };

function getRestBaseUrl(baseUrl: string): string {
  if (baseUrl.endsWith("/rest/v1")) return baseUrl;
  return `${baseUrl}/rest/v1`;
}

async function parseEdgeErrorDetail(res: Response): Promise<string> {
  const text = (await res.text().catch(() => "")).slice(0, 240);
  return text || "unknown";
}

export async function findExistingRedeemCodesEdgeRead(codes: string[]): Promise<string[]> {
  if (!codes.length) return [];

  const exists = new Set<string>();
  const chunkSize = 100;

  for (let index = 0; index < codes.length; index += chunkSize) {
    const chunk = codes.slice(index, index + chunkSize);
    const rows = await fetchEdgeRows<RedeemCodeExistsRow>(
      "RedeemCode",
      new URLSearchParams({
        select: "code",
        code: `in.(${chunk.join(",")})`,
      })
    );
    for (const row of rows) {
      if (row.code) exists.add(row.code);
    }
  }

  return Array.from(exists);
}

export async function updateRedeemCodeByIdEdgeWrite(args: {
  codeId: string;
  status?: "active" | "disabled" | "exhausted" | "expired";
  note?: string;
  startsAt?: Date | null;
  expiresAt?: Date | null;
  updatedAt: Date;
}): Promise<void> {
  const config = getEdgeDbConfig("write");
  if (!config) {
    throw new Error("edge_db_not_configured");
  }

  const url = new URL(`${getRestBaseUrl(config.baseUrl)}/RedeemCode`);
  url.search = new URLSearchParams({ id: `eq.${args.codeId}` }).toString();

  const payload: Record<string, unknown> = {
    updatedAt: args.updatedAt.toISOString(),
  };

  if (args.status !== undefined) payload.status = args.status;
  if (args.note !== undefined) payload.note = args.note;
  if (args.startsAt !== undefined)
    payload.startsAt = args.startsAt ? args.startsAt.toISOString() : null;
  if (args.expiresAt !== undefined)
    payload.expiresAt = args.expiresAt ? args.expiresAt.toISOString() : null;

  const res = await fetch(url.toString(), {
    method: "PATCH",
    headers: {
      apikey: config.apiKey,
      authorization: `Bearer ${config.apiKey}`,
      accept: "application/json",
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await parseEdgeErrorDetail(res);
    throw new Error(`edge_db_request_failed:RedeemCode:${res.status}:${detail}`);
  }
}
