import "server-only";

import { fetchEdgeRows, getEdgeDbConfig } from "@/lib/edge-db/client";

type CompanionScheduleRow = {
  schedule: unknown;
};

type CompanionPlayerIdRow = {
  id: string;
};

export type CompanionScheduleSlot = {
  day: number;
  start: string;
  end: string;
};

function getRestBaseUrl(baseUrl: string): string {
  return baseUrl.endsWith("/rest/v1") ? baseUrl : `${baseUrl}/rest/v1`;
}

function toScheduleSlots(value: unknown): CompanionScheduleSlot[] {
  if (!value || typeof value !== "object") return [];
  const slots = (value as { slots?: unknown }).slots;
  if (!Array.isArray(slots)) return [];

  return slots.filter((slot): slot is CompanionScheduleSlot => {
    if (!slot || typeof slot !== "object") return false;
    const candidate = slot as Partial<CompanionScheduleSlot>;
    return (
      typeof candidate.day === "number" &&
      typeof candidate.start === "string" &&
      typeof candidate.end === "string"
    );
  });
}

async function parseEdgeErrorDetail(res: Response): Promise<string> {
  const text = (await res.text().catch(() => "")).slice(0, 240);
  return text || "unknown";
}

export async function getCompanionScheduleByAddressEdgeRead(
  address: string
): Promise<CompanionScheduleSlot[]> {
  const params = new URLSearchParams({
    select: "schedule",
    address: `eq.${address}`,
    limit: "1",
  });
  const rows = await fetchEdgeRows<CompanionScheduleRow>("AdminPlayer", params);
  if (rows.length === 0) return [];
  return toScheduleSlots(rows[0].schedule);
}

export async function updateCompanionScheduleByAddressEdgeWrite(
  address: string,
  slots: CompanionScheduleSlot[]
): Promise<boolean> {
  const config = getEdgeDbConfig("write");
  if (!config) {
    throw new Error("edge_db_not_configured");
  }

  const url = new URL(`${getRestBaseUrl(config.baseUrl)}/AdminPlayer`);
  url.searchParams.set("address", `eq.${address}`);
  url.searchParams.set("select", "id");

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
      schedule: { slots },
      updatedAt: new Date().toISOString(),
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const detail = await parseEdgeErrorDetail(res);
    throw new Error(`edge_db_request_failed:AdminPlayer:${res.status}:${detail}`);
  }

  const rows = (await res.json().catch(() => null)) as CompanionPlayerIdRow[] | null;
  if (!Array.isArray(rows)) {
    throw new Error("edge_db_invalid_payload:AdminPlayer");
  }
  return rows.length > 0;
}
