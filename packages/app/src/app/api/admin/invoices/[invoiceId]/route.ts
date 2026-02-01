import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { removeInvoiceRequest, updateInvoiceRequest } from "@/lib/admin-store";
import { recordAudit } from "@/lib/admin-audit";
import type { AdminInvoiceRequest } from "@/lib/admin-types";

type RouteContext = { params: Promise<{ invoiceId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  let body: Partial<AdminInvoiceRequest> = {};
  try {
    body = (await req.json()) as Partial<AdminInvoiceRequest>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { invoiceId } = await params;
  const updated = await updateInvoiceRequest(invoiceId, {
    status: body.status,
    note: body.note,
  });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit(req, auth, "invoices.update", "invoice", invoiceId, {
    status: updated.status,
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const { invoiceId } = await params;
  const ok = await removeInvoiceRequest(invoiceId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit(req, auth, "invoices.delete", "invoice", invoiceId);
  return NextResponse.json({ ok: true });
}
