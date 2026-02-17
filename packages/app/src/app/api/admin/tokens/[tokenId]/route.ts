import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { recordAudit } from "@/lib/admin-audit";
import { removeAccessToken, updateAccessToken } from "@/lib/admin-store";
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

async function resolveParams(context: { params: { tokenId: string } | Promise<{ tokenId: string }> }) {
  return await Promise.resolve(context.params);
}

export async function PATCH(req: Request, context: { params: { tokenId: string } | Promise<{ tokenId: string }> }) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;
  const { tokenId } = await resolveParams(context);

  let body: Partial<AdminAccessToken> = {};
  try {
    body = (await req.json()) as Partial<AdminAccessToken>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Partial<AdminAccessToken> = {};
  if (typeof body.label === "string") {
    const trimmed = body.label.trim();
    patch.label = trimmed ? trimmed : "";
  }
  if (typeof body.role === "string") {
    const role = body.role as AdminRole;
    if (!roleSet.has(role)) {
      return NextResponse.json({ error: "invalid_role" }, { status: 400 });
    }
    patch.role = role;
  }
  if (typeof body.status === "string") {
    const status = body.status as AdminTokenStatus;
    if (!statusSet.has(status)) {
      return NextResponse.json({ error: "invalid_status" }, { status: 400 });
    }
    patch.status = status;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "empty_patch" }, { status: 400 });
  }

  const updated = await updateAccessToken(tokenId, patch);
  if (!updated) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await recordAudit(req, auth, "tokens.update", "access_token", tokenId, {
    role: updated.role,
    status: updated.status,
    label: updated.label,
  });

  return NextResponse.json(toPublicToken(updated));
}

export async function DELETE(req: Request, context: { params: { tokenId: string } | Promise<{ tokenId: string }> }) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;
  const { tokenId } = await resolveParams(context);

  const removed = await removeAccessToken(tokenId);
  if (!removed) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await recordAudit(req, auth, "tokens.delete", "access_token", tokenId);
  return NextResponse.json({ ok: true });
}
