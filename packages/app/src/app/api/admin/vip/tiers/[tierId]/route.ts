import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { removeMembershipTier, updateMembershipTier } from "@/lib/admin-store";
import { recordAudit } from "@/lib/admin-audit";
import type { AdminMembershipTier } from "@/lib/admin-types";

type RouteContext = { params: Promise<{ tierId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  let body: Partial<AdminMembershipTier> = {};
  try {
    body = (await req.json()) as Partial<AdminMembershipTier>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { tierId } = await params;
  const updated = await updateMembershipTier(tierId, body);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit(req, auth, "vip.tier.update", "vip-tier", tierId, {
    status: updated.status,
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const { tierId } = await params;
  const ok = await removeMembershipTier(tierId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit(req, auth, "vip.tier.delete", "vip-tier", tierId);
  return NextResponse.json({ ok: true });
}
