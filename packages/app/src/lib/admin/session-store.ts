import type { AdminSession, AdminAccessToken } from "./admin-types";
import { prisma } from "./admin-store-utils";

function mapSession(row: {
  id: string;
  tokenHash: string;
  role: string;
  label: string | null;
  createdAt: Date;
  expiresAt: Date;
  lastSeenAt: Date | null;
  ip: string | null;
  userAgent: string | null;
}): AdminSession {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    role: row.role as AdminSession["role"],
    label: row.label || undefined,
    createdAt: row.createdAt.getTime(),
    expiresAt: row.expiresAt.getTime(),
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.getTime() : undefined,
    ip: row.ip || undefined,
    userAgent: row.userAgent || undefined,
  };
}

function mapAccessToken(row: {
  id: string;
  tokenHash: string;
  tokenPrefix: string;
  role: string;
  label: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date | null;
  lastUsedAt: Date | null;
}): AdminAccessToken {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    tokenPrefix: row.tokenPrefix,
    role: row.role as AdminAccessToken["role"],
    label: row.label || undefined,
    status: row.status as AdminAccessToken["status"],
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.getTime() : undefined,
  };
}

export async function createSession(session: AdminSession) {
  const row = await prisma.adminSession.create({
    data: {
      id: session.id,
      tokenHash: session.tokenHash,
      role: session.role,
      label: session.label ?? null,
      createdAt: new Date(session.createdAt),
      expiresAt: new Date(session.expiresAt),
      lastSeenAt: session.lastSeenAt ? new Date(session.lastSeenAt) : null,
      ip: session.ip ?? null,
      userAgent: session.userAgent ?? null,
    },
  });
  return mapSession(row);
}

export async function getSessionByHash(tokenHash: string) {
  const row = await prisma.adminSession.findUnique({ where: { tokenHash } });
  return row ? mapSession(row) : null;
}

export async function updateSessionByHash(tokenHash: string, patch: Partial<AdminSession>) {
  try {
    const row = await prisma.adminSession.update({
      where: { tokenHash },
      data: {
        role: patch.role,
        label: patch.label ?? undefined,
        lastSeenAt: patch.lastSeenAt ? new Date(patch.lastSeenAt) : new Date(),
        expiresAt: patch.expiresAt ? new Date(patch.expiresAt) : undefined,
        ip: patch.ip ?? undefined,
        userAgent: patch.userAgent ?? undefined,
      },
    });
    return mapSession(row);
  } catch {
    return null;
  }
}

export async function removeSessionByHash(tokenHash: string) {
  try {
    await prisma.adminSession.delete({ where: { tokenHash } });
    return true;
  } catch {
    return false;
  }
}

export async function listAccessTokens() {
  const rows = await prisma.adminAccessToken.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(mapAccessToken);
}

export async function getAccessTokenByHash(tokenHash: string) {
  try {
    const row = await prisma.adminAccessToken.findUnique({ where: { tokenHash } });
    return row ? mapAccessToken(row) : null;
  } catch {
    return null;
  }
}

export async function addAccessToken(token: AdminAccessToken) {
  const row = await prisma.adminAccessToken.create({
    data: {
      id: token.id,
      tokenHash: token.tokenHash,
      tokenPrefix: token.tokenPrefix,
      role: token.role,
      label: token.label ?? null,
      status: token.status,
      createdAt: new Date(token.createdAt),
      updatedAt: token.updatedAt ? new Date(token.updatedAt) : null,
      lastUsedAt: token.lastUsedAt ? new Date(token.lastUsedAt) : null,
    },
  });
  return mapAccessToken(row);
}

export async function updateAccessToken(tokenId: string, patch: Partial<AdminAccessToken>) {
  try {
    const row = await prisma.adminAccessToken.update({
      where: { id: tokenId },
      data: {
        role: patch.role,
        label: patch.label === "" ? null : (patch.label ?? undefined),
        status: patch.status,
        updatedAt: new Date(),
        lastUsedAt: patch.lastUsedAt ? new Date(patch.lastUsedAt) : undefined,
      },
    });
    return mapAccessToken(row);
  } catch {
    return null;
  }
}

export async function touchAccessTokenByHash(tokenHash: string) {
  try {
    await prisma.adminAccessToken.update({
      where: { tokenHash },
      data: { lastUsedAt: new Date(), updatedAt: new Date() },
    });
    return true;
  } catch {
    return false;
  }
}

export async function removeAccessToken(tokenId: string) {
  try {
    await prisma.adminAccessToken.delete({ where: { id: tokenId } });
    return true;
  } catch {
    return false;
  }
}
