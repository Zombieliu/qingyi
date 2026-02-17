import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { addAccessToken, listAccessTokens } from "@/lib/admin-store";
import { recordAudit } from "@/lib/admin-audit";
import type { AdminAccessToken, AdminRole, AdminTokenStatus } from "@/lib/admin-types";
import { ADMIN_ROLE_OPTIONS, ADMIN_TOKEN_STATUS_OPTIONS } from "@/lib/admin-types";

const roleSet = new Set(ADMIN_ROLE_OPTIONS);
const statusSet = new Set(ADMIN_TOKEN_STATUS_OPTIONS);

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

  let body: Partial<AdminAccessToken> = {};
  try {
    body = (await req.json()) as Partial<AdminAccessToken>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const role = typeof body.role === "string" ? (body.role as AdminRole) : null;
  if (!role || !roleSet.has(role)) {
    return NextResponse.json({ error: "invalid_role" }, { status: 400 });
  }
  const status =
    typeof body.status === "string" && statusSet.has(body.status as AdminTokenStatus)
      ? (body.status as AdminTokenStatus)
      : ("active" as AdminTokenStatus);
  const label = typeof body.label === "string" ? body.label.trim() : "";

  const plainToken = crypto.randomBytes(24).toString("hex");
  const now = Date.now();
  const entry: AdminAccessToken = {
    id: body.id || `ATK-${now}-${crypto.randomInt(1000, 9999)}`,
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
