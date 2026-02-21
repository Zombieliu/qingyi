import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import {
  getMemberByAddress,
  getMembershipTierById,
  updateMember,
  updateMembershipRequest,
  addMember,
  removeMembershipRequest,
} from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseBody } from "@/lib/shared/api-validation";
import type { AdminMember, MemberStatus } from "@/lib/admin/admin-types";

const patchSchema = z.object({
  status: z.enum(["待审核", "已通过", "已拒绝"]).optional(),
  note: z.string().optional(),
});

type RouteContext = { params: Promise<{ requestId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const { requestId } = await params;
  const updated = await updateMembershipRequest(requestId, {
    status: body.status,
    note: body.note,
  });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (updated.status === "已通过" && updated.userAddress) {
    const tier = updated.tierId ? await getMembershipTierById(updated.tierId) : null;
    const durationDays = tier?.durationDays ?? 30;
    const expiresAt = Date.now() + durationDays * 24 * 60 * 60 * 1000;
    const existing = await getMemberByAddress(updated.userAddress);
    if (existing) {
      await updateMember(existing.id, {
        tierId: updated.tierId,
        tierName: updated.tierName,
        status: "有效" as MemberStatus,
        expiresAt,
      });
    } else {
      const member: AdminMember = {
        id: `MBR-${Date.now()}`,
        userAddress: updated.userAddress,
        userName: updated.userName,
        tierId: updated.tierId,
        tierName: updated.tierName,
        status: "有效" as MemberStatus,
        expiresAt,
        createdAt: Date.now(),
      };
      await addMember(member);
    }
  }

  await recordAudit(req, auth, "vip.request.update", "vip-request", requestId, {
    status: updated.status,
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const { requestId } = await params;
  const ok = await removeMembershipRequest(requestId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit(req, auth, "vip.request.delete", "vip-request", requestId);
  return NextResponse.json({ ok: true });
}
