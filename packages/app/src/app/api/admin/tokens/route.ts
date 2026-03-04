import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { addAccessToken, listAccessTokens } from "@/lib/admin/session-store-edge";
import { recordAudit } from "@/lib/admin/admin-audit";
import type { AdminAccessToken } from "@/lib/admin/admin-types";
import { parseBody } from "@/lib/shared/api-validation";
import { randomHex, randomInt, sha256Hex } from "@/lib/shared/runtime-crypto";

const postSchema = z.object({
  role: z.enum(["admin", "ops", "finance", "viewer"]),
  status: z.enum(["active", "disabled"]).default("active"),
  label: z.string().trim().optional(),
});

function toPublicToken(token: AdminAccessToken) {
  return {
    id: token.id,
    tokenPrefix: token.tokenPrefix,
    role: token.role,
    label: token.label,
    status: token.status,
    createdAt: token.createdAt,
    updatedAt: token.updatedAt,
    lastUsedAt: token.lastUsedAt,
  };
}

async function hashToken(raw: string) {
  return sha256Hex(raw);
}

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;
  const tokens = await listAccessTokens();
  return NextResponse.json(tokens.map(toPublicToken));
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, postSchema);
  if (!parsed.success) return parsed.response;
  const { role, status, label: rawLabel } = parsed.data;
  const label = rawLabel ?? "";

  const plainToken = randomHex(24);
  const now = Date.now();
  const entry: AdminAccessToken = {
    id: `ATK-${now}-${randomInt(1000, 9999)}`,
    tokenHash: await hashToken(plainToken),
    tokenPrefix: plainToken.slice(0, 6),
    role,
    label: label || undefined,
    status,
    createdAt: now,
  };

  const saved = await addAccessToken(entry);
  await recordAudit(req, auth, "tokens.create", "access_token", saved.id, {
    role: saved.role,
    label: saved.label,
    status: saved.status,
  });
  return NextResponse.json({ token: plainToken, item: toPublicToken(saved) }, { status: 201 });
}
