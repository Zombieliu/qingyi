import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { removeInvoiceRequest, updateInvoiceRequest } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseBody } from "@/lib/shared/api-validation";

const patchSchema = z.object({
  status: z.enum(["待审核", "已开票", "已拒绝"]).optional(),
  note: z.string().optional(),
});

type RouteContext = { params: Promise<{ invoiceId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.success) return parsed.response;

  const { invoiceId } = await params;
  const updated = await updateInvoiceRequest(invoiceId, {
    status: parsed.data.status,
    note: parsed.data.note,
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
