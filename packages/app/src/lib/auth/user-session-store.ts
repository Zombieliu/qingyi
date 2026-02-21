import "server-only";
import { prisma } from "../db";

export type UserSessionRecord = {
  id: string;
  tokenHash: string;
  address: string;
  createdAt: number;
  expiresAt: number;
  lastSeenAt?: number | null;
  ip?: string | null;
  userAgent?: string | null;
};

function toDate(value?: number | null) {
  if (!value) return null;
  return new Date(value);
}

function toRecord(row: {
  id: string;
  tokenHash: string;
  address: string;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date | null;
  ip: string | null;
  userAgent: string | null;
}): UserSessionRecord {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    address: row.address,
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
    lastSeenAt: row.lastSeenAt?.getTime() ?? null,
    ip: row.ip ?? null,
    userAgent: row.userAgent ?? null,
  };
}

export async function createUserSession(session: UserSessionRecord) {
  const row = await prisma.userSession.create({
    data: {
      id: session.id,
      tokenHash: session.tokenHash,
      address: session.address,
      createdAt: new Date(session.createdAt),
      expiresAt: new Date(session.expiresAt),
      lastSeenAt: toDate(session.lastSeenAt) as Date | null,
      ip: session.ip ?? null,
      userAgent: session.userAgent ?? null,
    },
  });
  return toRecord(row);
}

export async function getUserSessionByHash(tokenHash: string) {
  const row = await prisma.userSession.findUnique({ where: { tokenHash } });
  return row ? toRecord(row) : null;
}

export async function updateUserSessionByHash(
  tokenHash: string,
  patch: Partial<UserSessionRecord>
) {
  const row = await prisma.userSession.update({
    where: { tokenHash },
    data: {
      expiresAt: patch.expiresAt ? new Date(patch.expiresAt) : undefined,
      lastSeenAt: patch.lastSeenAt !== undefined ? toDate(patch.lastSeenAt) : undefined,
      ip: patch.ip ?? undefined,
      userAgent: patch.userAgent ?? undefined,
    },
  });
  return toRecord(row);
}

export async function removeUserSessionByHash(tokenHash: string) {
  try {
    await prisma.userSession.delete({ where: { tokenHash } });
    return true;
  } catch {
    return false;
  }
}
