import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { removeMember, updateMember } from "@/lib/admin-store";
import { recordAudit } from "@/lib/admin-audit";
import type { AdminMember } from "@/lib/admin-types";

type RouteContext = { params: Promise<{ memberId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  let body: Partial<AdminMember> = {};
  try {
    body = (await req.json()) as Partial<AdminMember>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { memberId } = await params;
  const updated = await updateMember(memberId, body);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit(req, auth, "vip.member.update", "vip-member", memberId, {
    status: updated.status,
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const { memberId } = await params;
  const ok = await removeMember(memberId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit(req, auth, "vip.member.delete", "vip-member", memberId);
  return NextResponse.json({ ok: true });
}
