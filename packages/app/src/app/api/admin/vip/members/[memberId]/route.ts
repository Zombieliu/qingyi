import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { removeMember, updateMember } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseBody } from "@/lib/shared/api-validation";

const patchSchema = z.object({
  userAddress: z.string().optional(),
  userName: z.string().optional(),
  tierId: z.string().optional(),
  tierName: z.string().optional(),
  points: z.number().optional(),
  status: z.enum(["有效", "已过期", "待开通"]).optional(),
  expiresAt: z.number().optional(),
  note: z.string().optional(),
});

type RouteContext = { params: Promise<{ memberId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

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
