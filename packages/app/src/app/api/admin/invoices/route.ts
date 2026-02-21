import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import {
  addInvoiceRequest,
  queryInvoiceRequests,
  queryInvoiceRequestsCursor,
} from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import type { AdminInvoiceRequest, InvoiceStatus } from "@/lib/admin/admin-types";
import { decodeCursorParam, encodeCursorParam } from "@/lib/cursor-utils";
import { parseBody } from "@/lib/shared/api-validation";

const postSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  user: z.string().optional(),
  userAddress: z.string().optional(),
  contact: z.string().optional(),
  email: z.string().optional(),
  orderId: z.string().optional(),
  amount: z.number().optional(),
  taxId: z.string().optional(),
  address: z.string().optional(),
  status: z.enum(["待审核", "已开票", "已拒绝"]).default("待审核"),
  note: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

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

  const parsed = await parseBody(req, postSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

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
    status: body.status as InvoiceStatus,
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
