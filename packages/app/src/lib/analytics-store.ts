import "server-only";
import crypto from "crypto";
import { prisma } from "./db";
import { Prisma } from "@prisma/client";
import type { GrowthEvent } from "./admin-types";

export type GrowthEventInput = {
  event: string;
  clientId?: string;
  sessionId?: string;
  userAddress?: string;
  path?: string;
  referrer?: string;
  ua?: string;
  meta?: Record<string, unknown>;
  createdAt?: number;
};

export async function recordGrowthEvent(input: GrowthEventInput): Promise<GrowthEvent> {
  const createdAt = new Date(input.createdAt ?? Date.now());
  const row = await prisma.growthEvent.create({
    data: {
      id: crypto.randomUUID(),
      event: input.event,
      clientId: input.clientId ?? null,
      sessionId: input.sessionId ?? null,
      userAddress: input.userAddress ?? null,
      path: input.path ?? null,
      referrer: input.referrer ?? null,
      ua: input.ua ?? null,
      meta: (input.meta ?? undefined) as Prisma.InputJsonValue | undefined,
      createdAt,
    },
  });
  return {
    id: row.id,
    event: row.event,
    clientId: row.clientId || undefined,
    sessionId: row.sessionId || undefined,
    userAddress: row.userAddress || undefined,
    path: row.path || undefined,
    referrer: row.referrer || undefined,
    ua: row.ua || undefined,
    meta: (row.meta as Record<string, unknown> | null) || undefined,
    createdAt: row.createdAt.getTime(),
  };
}

export async function listGrowthEvents(params: { since?: Date; event?: string }) {
  const where: { createdAt?: { gte: Date }; event?: string } = {};
  if (params.since) where.createdAt = { gte: params.since };
  if (params.event) where.event = params.event;
  return prisma.growthEvent.findMany({
    where,
    select: {
      id: true,
      event: true,
      clientId: true,
      sessionId: true,
      userAddress: true,
      path: true,
      referrer: true,
      ua: true,
      meta: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}
