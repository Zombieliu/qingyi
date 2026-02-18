import "server-only";
import type { EventId } from "@mysten/sui/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";

const DEFAULT_CURSOR_ID = "chain-orders";

type ChainEventCursorState = {
  id: string;
  cursor: EventId | null;
  lastEventAt: Date | null;
  updatedAt: Date | null;
};

function isEventId(value: unknown): value is EventId {
  if (!value || typeof value !== "object") return false;
  const raw = value as { txDigest?: unknown; eventSeq?: unknown };
  return typeof raw.txDigest === "string" && typeof raw.eventSeq === "string";
}

export async function getChainEventCursor(id = DEFAULT_CURSOR_ID): Promise<ChainEventCursorState | null> {
  const row = await prisma.chainEventCursor.findUnique({ where: { id } });
  if (!row) return null;
  const rawCursor = row.cursor as Prisma.JsonValue | null;
  const cursor = isEventId(rawCursor) ? rawCursor : null;
  return {
    id: row.id,
    cursor,
    lastEventAt: row.lastEventAt ?? null,
    updatedAt: row.updatedAt ?? null,
  };
}

export async function updateChainEventCursor(params: {
  id?: string;
  cursor: EventId;
  lastEventMs?: number;
}) {
  const id = params.id || DEFAULT_CURSOR_ID;
  const now = new Date();
  const lastEventAt = params.lastEventMs ? new Date(params.lastEventMs) : null;
  const data = {
    cursor: params.cursor as unknown as Prisma.InputJsonValue,
    lastEventAt,
    updatedAt: now,
  };
  return prisma.chainEventCursor.upsert({
    where: { id },
    create: {
      id,
      ...data,
      createdAt: now,
    },
    update: data,
  });
}

export { DEFAULT_CURSOR_ID as CHAIN_EVENT_CURSOR_ID };
