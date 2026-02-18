import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { addOrder, queryOrders, queryOrdersCursor } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import type { AdminOrder, OrderStage } from "@/lib/admin/admin-types";
import { decodeCursorParam, encodeCursorParam } from "@/lib/cursor-utils";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const stage = searchParams.get("stage") || undefined;
  const q = searchParams.get("q") || undefined;
  const paymentStatus = searchParams.get("paymentStatus") || undefined;
  const assignedTo = searchParams.get("assignedTo") || undefined;
  const cursorRaw = searchParams.get("cursor");
  const cursor = decodeCursorParam(cursorRaw);
  const useCursor = !searchParams.has("page") || cursorRaw !== null;
  if (useCursor) {
    const result = await queryOrdersCursor({ pageSize, stage, q, paymentStatus, assignedTo, cursor: cursor || undefined });
    return NextResponse.json({
      items: result.items,
      nextCursor: encodeCursorParam(result.nextCursor),
    });
  }
  const result = await queryOrders({ page, pageSize, stage, q, paymentStatus, assignedTo });
  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
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
  await recordAudit(req, auth, "orders.create", "order", order.id, {
    amount: order.amount,
    source: order.source,
  });
  return NextResponse.json(order, { status: 201 });
}
