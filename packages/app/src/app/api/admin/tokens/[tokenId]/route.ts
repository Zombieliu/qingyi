import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { recordAudit } from "@/lib/admin/admin-audit";
import { removeAccessToken, updateAccessToken } from "@/lib/admin/admin-store";
import type { AdminAccessToken } from "@/lib/admin/admin-types";
import { parseBody } from "@/lib/shared/api-validation";

const patchSchema = z.object({
  label: z.string().trim().optional(),
  role: z.enum(["admin", "ops", "finance", "viewer"]).optional(),
  status: z.enum(["active", "disabled"]).optional(),
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

async function resolveParams(context: {
  params: { tokenId: string } | Promise<{ tokenId: string }>;
}) {
  return await Promise.resolve(context.params);
}

export async function PATCH(
  req: Request,
  context: { params: { tokenId: string } | Promise<{ tokenId: string }> }
) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;
  const { tokenId } = await resolveParams(context);

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.success) return parsed.response;

  const patch: Partial<AdminAccessToken> = {};
  if (parsed.data.label !== undefined) patch.label = parsed.data.label;
  if (parsed.data.role !== undefined) patch.role = parsed.data.role;
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;

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

export async function DELETE(
  req: Request,
  context: { params: { tokenId: string } | Promise<{ tokenId: string }> }
) {
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
