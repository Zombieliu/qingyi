import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { removeExaminerApplication, updateExaminerApplication } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseBody } from "@/lib/shared/api-validation";
import { createNotification } from "@/lib/services/notification-service";

const patchSchema = z.object({
  status: z.enum(["待审核", "面试中", "已通过", "已拒绝"]).optional(),
  note: z.string().optional(),
});

type RouteContext = { params: Promise<{ applicationId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const { applicationId } = await params;
  const updated = await updateExaminerApplication(applicationId, {
    status: body.status,
    note: body.note,
  });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (body.status && updated.userAddress) {
    await createNotification({
      userAddress: updated.userAddress,
      type: "system",
      title: "考官申请状态更新",
      body: `当前状态：${updated.status}`,
    }).catch(() => null);
  }

  await recordAudit(req, auth, "examiners.update", "examiner", applicationId, {
    status: updated.status,
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const { applicationId } = await params;
  const ok = await removeExaminerApplication(applicationId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit(req, auth, "examiners.delete", "examiner", applicationId);
  return NextResponse.json({ ok: true });
}
