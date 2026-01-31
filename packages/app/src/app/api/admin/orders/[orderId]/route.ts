import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { updateOrder } from "@/lib/admin-store";
import type { AdminOrder, OrderStage } from "@/lib/admin-types";

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function PATCH(
  req: Request,
  { params }: RouteContext
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }

  let body: Partial<AdminOrder> = {};
  try {
    body = (await req.json()) as Partial<AdminOrder>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Partial<AdminOrder> = {};
  if (typeof body.paymentStatus === "string") patch.paymentStatus = body.paymentStatus;
  if (typeof body.note === "string") patch.note = body.note;
  if (typeof body.assignedTo === "string") patch.assignedTo = body.assignedTo;
  if (typeof body.stage === "string") patch.stage = body.stage as OrderStage;

  const updated = await updateOrder(orderId, patch);
  if (!updated) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}
