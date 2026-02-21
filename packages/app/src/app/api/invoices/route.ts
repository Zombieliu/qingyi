import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { addInvoiceRequest } from "@/lib/admin/admin-store";
import type { AdminInvoiceRequest, InvoiceStatus } from "@/lib/admin/admin-types";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/shared/api-utils";
import { parseBody } from "@/lib/shared/api-validation";

const invoiceSchema = z.object({
  title: z.string().trim().min(1, "title required"),
  email: z.string().trim().min(1, "email required"),
  taxId: z.string().trim().optional(),
  contact: z.string().trim().optional(),
  orderId: z.string().trim().optional(),
  amount: z.number().optional(),
  address: z.string().trim().optional(),
  note: z.string().trim().optional(),
  userAddress: z.string().optional(),
});

export async function POST(req: Request) {
  if (!(await rateLimit(`invoices:${getClientIp(req)}`, 5, 60000))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = await parseBody(req, invoiceSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const request: AdminInvoiceRequest = {
    id: `INV-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    title: body.title,
    taxId: body.taxId,
    email: body.email,
    contact: body.contact,
    orderId: body.orderId,
    amount: body.amount,
    address: body.address,
    note: body.note,
    userAddress: body.userAddress,
    status: "待审核" as InvoiceStatus,
    createdAt: Date.now(),
  };

  await addInvoiceRequest(request);
  return NextResponse.json({ id: request.id, status: request.status });
}
