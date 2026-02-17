import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { addInvoiceRequest, queryInvoiceRequests, queryInvoiceRequestsCursor } from "@/lib/admin-store";
import { recordAudit } from "@/lib/admin-audit";
import type { AdminInvoiceRequest, InvoiceStatus } from "@/lib/admin-types";
import { decodeCursorParam, encodeCursorParam } from "@/lib/cursor-utils";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const status = searchParams.get("status") || "";
  const q = searchParams.get("q") || "";
  const cursorRaw = searchParams.get("cursor");
  const cursor = decodeCursorParam(cursorRaw);
  const useCursor = !searchParams.has("page") || cursorRaw !== null;
  if (useCursor) {
    const result = await queryInvoiceRequestsCursor({
      pageSize,
      status: status || undefined,
      q: q || undefined,
      cursor: cursor || undefined,
    });
    return NextResponse.json({
      items: result.items,
      nextCursor: encodeCursorParam(result.nextCursor),
    });
  }

  const result = await queryInvoiceRequests({ page, pageSize, status, q });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  let body: Partial<AdminInvoiceRequest> = {};
  try {
    body = (await req.json()) as Partial<AdminInvoiceRequest>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const request: AdminInvoiceRequest = {
    id: body.id || `INV-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    user: body.user,
    userAddress: body.userAddress,
    contact: body.contact,
    email: body.email,
    orderId: body.orderId,
    amount: body.amount,
    title: body.title,
    taxId: body.taxId,
    address: body.address,
    status: (body.status as InvoiceStatus) || "待审核",
    note: body.note,
    meta: body.meta,
    createdAt: Date.now(),
  };

  await addInvoiceRequest(request);
  await recordAudit(req, auth, "invoices.create", "invoice", request.id, {
    title: request.title,
    status: request.status,
  });

  return NextResponse.json(request, { status: 201 });
}
