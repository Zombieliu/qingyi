import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { removeGuardianApplication, updateGuardianApplication } from "@/lib/admin-store";
import { recordAudit } from "@/lib/admin-audit";
import type { AdminGuardianApplication } from "@/lib/admin-types";

type RouteContext = { params: Promise<{ applicationId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  let body: Partial<AdminGuardianApplication> = {};
  try {
    body = (await req.json()) as Partial<AdminGuardianApplication>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { applicationId } = await params;
  const updated = await updateGuardianApplication(applicationId, {
    status: body.status,
    note: body.note,
  });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit(req, auth, "guardians.update", "guardian", applicationId, {
    status: updated.status,
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const { applicationId } = await params;
  const ok = await removeGuardianApplication(applicationId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit(req, auth, "guardians.delete", "guardian", applicationId);
  return NextResponse.json({ ok: true });
}
