import { NextResponse } from "next/server";
import crypto from "crypto";
import { addInvoiceRequest } from "@/lib/admin-store";
import type { AdminInvoiceRequest, InvoiceStatus } from "@/lib/admin-types";

export async function POST(req: Request) {
  let body: {
    title?: string;
    taxId?: string;
    email?: string;
    contact?: string;
    orderId?: string;
    amount?: number;
    address?: string;
    note?: string;
    userAddress?: string;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  if (!body.email?.trim()) {
    return NextResponse.json({ error: "email required" }, { status: 400 });
  }

  const request: AdminInvoiceRequest = {
    id: `INV-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    title: body.title.trim(),
    taxId: body.taxId?.trim(),
    email: body.email.trim(),
    contact: body.contact?.trim(),
    orderId: body.orderId?.trim(),
    amount: typeof body.amount === "number" ? body.amount : undefined,
    address: body.address?.trim(),
    note: body.note?.trim(),
    userAddress: body.userAddress,
    status: "待审核" as InvoiceStatus,
    createdAt: Date.now(),
  };

  await addInvoiceRequest(request);
  return NextResponse.json({ id: request.id, status: request.status });
}
