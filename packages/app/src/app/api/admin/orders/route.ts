import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { addOrder, queryOrders, queryOrdersCursor } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import type { AdminOrder, OrderStage } from "@/lib/admin/admin-types";
import { decodeCursorParam, encodeCursorParam } from "@/lib/cursor-utils";
import { parseBody } from "@/lib/shared/api-validation";

const postSchema = z.object({
  id: z.string().optional(),
  user: z.string().min(1),
  item: z.string().min(1),
  amount: z.number(),
  currency: z.string().default("CNY"),
  paymentStatus: z.string().default("已支付"),
  stage: z.string().default("待处理"),
  note: z.string().optional(),
  assignedTo: z.string().optional(),
  source: z.string().default("manual"),
});

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
    const result = await queryOrdersCursor({
      pageSize,
      stage,
      q,
      paymentStatus,
      assignedTo,
      cursor: cursor || undefined,
    });
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

  const parsed = await parseBody(req, postSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const order: AdminOrder = {
    id: body.id || `ORD-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    user: body.user,
    item: body.item,
    amount: body.amount,
    currency: body.currency,
    paymentStatus: body.paymentStatus,
    stage: body.stage as OrderStage,
    note: body.note,
    assignedTo: body.assignedTo,
    source: body.source,
    createdAt: Date.now(),
  };

  await addOrder(order);
  await recordAudit(req, auth, "orders.create", "order", order.id, {
    amount: order.amount,
    source: order.source,
  });
  return NextResponse.json(order, { status: 201 });
}
