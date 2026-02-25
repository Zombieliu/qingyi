import "server-only";
import { prisma } from "../db";
import { Prisma, PrismaClient } from "@prisma/client";

/** Prisma interactive transaction client — use as optional param type */
export type TransactionClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

export { prisma, Prisma };

export type CursorPayload = { createdAt: number; id: string };

export function buildCursorPayload(row: { id: string; createdAt: Date }): CursorPayload {
  return { id: row.id, createdAt: row.createdAt.getTime() };
}

export function appendCursorWhere(where: { AND?: unknown }, cursor?: CursorPayload) {
  if (!cursor) return;
  const cursorDate = new Date(cursor.createdAt);
  const condition = {
    OR: [{ createdAt: { lt: cursorDate } }, { createdAt: cursorDate, id: { lt: cursor.id } }],
  };
  if (where.AND) {
    const existing = Array.isArray(where.AND) ? where.AND : [where.AND];
    where.AND = [...existing, condition];
  } else {
    where.AND = [condition];
  }
}
