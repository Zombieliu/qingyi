import "server-only";
import type { EventId } from "@mysten/sui/client";
import {
  fetchEdgeRows,
  getEdgeDbConfig,
  insertEdgeRow,
  patchEdgeRowsByFilter,
  toEpochMs,
} from "@/lib/edge-db/client";

const DEFAULT_CURSOR_ID = "chain-orders";

type ChainEventCursorState = {
  id: string;
  cursor: EventId | null;
  lastEventAt: Date | null;
  updatedAt: Date | null;
};

type ChainEventCursorRow = {
  id: string;
  cursor: unknown;
  lastEventAt: string | number | null;
  updatedAt: string | number | null;
};

type LegacyChainEventCursor = {
  getChainEventCursor(id?: string): Promise<ChainEventCursorState | null>;
  updateChainEventCursor(params: {
    id?: string;
    cursor: EventId;
    lastEventMs?: number;
  }): Promise<unknown>;
};

let legacyStorePromise: Promise<LegacyChainEventCursor> | null = null;

async function loadLegacyStore(): Promise<LegacyChainEventCursor> {
  const modulePath = "./chain-event-cursor-legacy";
  legacyStorePromise ??= import(modulePath).then((mod) => mod as unknown as LegacyChainEventCursor);
  return legacyStorePromise;
}

function hasEdgeReadConfig(): boolean {
  return Boolean(getEdgeDbConfig("read"));
}

function hasEdgeWriteConfig(): boolean {
  return Boolean(getEdgeDbConfig("write"));
}

function isEventId(value: unknown): value is EventId {
  if (!value || typeof value !== "object") return false;
  const raw = value as { txDigest?: unknown; eventSeq?: unknown };
  return typeof raw.txDigest === "string" && typeof raw.eventSeq === "string";
}

function mapCursorRow(row: ChainEventCursorRow): ChainEventCursorState {
  const lastEventAtMs = toEpochMs(row.lastEventAt);
  const updatedAtMs = toEpochMs(row.updatedAt);
  return {
    id: row.id,
    cursor: isEventId(row.cursor) ? row.cursor : null,
    lastEventAt: lastEventAtMs ? new Date(lastEventAtMs) : null,
    updatedAt: updatedAtMs ? new Date(updatedAtMs) : null,
  };
}

export async function getChainEventCursor(
  id = DEFAULT_CURSOR_ID
): Promise<ChainEventCursorState | null> {
  if (!hasEdgeReadConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.getChainEventCursor(id);
  }

  const rows = await fetchEdgeRows<ChainEventCursorRow>(
    "ChainEventCursor",
    new URLSearchParams({
      select: "id,cursor,lastEventAt,updatedAt",
      id: `eq.${id}`,
      limit: "1",
    })
  );

  if (!rows[0]) return null;
  return mapCursorRow(rows[0]);
}

export async function updateChainEventCursor(params: {
  id?: string;
  cursor: EventId;
  lastEventMs?: number;
}) {
  if (!hasEdgeWriteConfig()) {
    const legacy = await loadLegacyStore();
    return legacy.updateChainEventCursor(params);
  }

  const id = params.id || DEFAULT_CURSOR_ID;
  const nowIso = new Date().toISOString();
  const payload = {
    cursor: params.cursor as unknown as Record<string, unknown>,
    lastEventAt: params.lastEventMs ? new Date(params.lastEventMs).toISOString() : null,
    updatedAt: nowIso,
  };

  const updated = await patchEdgeRowsByFilter<ChainEventCursorRow>(
    "ChainEventCursor",
    new URLSearchParams({
      select: "id,cursor,lastEventAt,updatedAt",
      id: `eq.${id}`,
    }),
    payload
  );

  if (updated[0]) {
    return mapCursorRow(updated[0]);
  }

  await insertEdgeRow(
    "ChainEventCursor",
    {
      id,
      ...payload,
      createdAt: nowIso,
    },
    "representation"
  );

  return {
    id,
    cursor: params.cursor,
    lastEventAt: params.lastEventMs ? new Date(params.lastEventMs) : null,
    updatedAt: new Date(nowIso),
  };
}

export { DEFAULT_CURSOR_ID as CHAIN_EVENT_CURSOR_ID };
