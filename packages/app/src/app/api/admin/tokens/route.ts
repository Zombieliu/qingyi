import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { addAccessToken, listAccessTokens } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import type { AdminAccessToken } from "@/lib/admin/admin-types";
import { parseBody } from "@/lib/shared/api-validation";

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

function hashToken(raw: string) {
  return crypto.createHash("sha256").update(raw).digest("hex");
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

  const plainToken = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  const entry: AdminAccessToken = {
    id: `ATK-${now}-${crypto.randomInt(1000, 9999)}`,
    tokenHash: hashToken(plainToken),
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
