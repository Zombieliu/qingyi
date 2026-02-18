import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { removeSupportTicket, updateSupportTicket } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import type { AdminSupportTicket } from "@/lib/admin/admin-types";

type RouteContext = { params: Promise<{ ticketId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  let body: Partial<AdminSupportTicket> = {};
  try {
    body = (await req.json()) as Partial<AdminSupportTicket>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ticketId } = await params;
  const updated = await updateSupportTicket(ticketId, {
    status: body.status,
    note: body.note,
    meta: body.meta,
  });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit(req, auth, "support.update", "support", ticketId, {
    status: updated.status,
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;
  const { ticketId } = await params;
  const ok = await removeSupportTicket(ticketId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  await recordAudit(req, auth, "support.delete", "support", ticketId);
  return NextResponse.json({ ok: true });
}
