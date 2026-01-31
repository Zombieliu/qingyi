import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { addOrder, listOrders } from "@/lib/admin-store";
import type { AdminOrder, OrderStage } from "@/lib/admin-types";

export async function GET() {
  const auth = requireAdmin();
  if (!auth.ok) return auth.response;
  const orders = await listOrders();
  return NextResponse.json(orders);
}

export async function POST(req: Request) {
  const auth = requireAdmin();
  if (!auth.ok) return auth.response;

  let body: Partial<AdminOrder> = {};
  try {
    body = (await req.json()) as Partial<AdminOrder>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.user || !body.item || typeof body.amount !== "number") {
    return NextResponse.json({ error: "user, item, amount are required" }, { status: 400 });
  }

  const order: AdminOrder = {
    id: body.id || `ORD-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    user: body.user,
    item: body.item,
    amount: body.amount,
    currency: body.currency || "CNY",
    paymentStatus: body.paymentStatus || "已支付",
    stage: (body.stage as OrderStage) || "待处理",
    note: body.note,
    assignedTo: body.assignedTo,
    source: body.source || "manual",
    createdAt: Date.now(),
  };

  await addOrder(order);
  return NextResponse.json(order, { status: 201 });
}
