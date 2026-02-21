import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { getOrderById, listPlayers, updateOrder } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import { canTransitionStage, isChainOrder } from "@/lib/order-guard";
import type { AdminOrder, OrderStage } from "@/lib/admin/admin-types";
import { parseBody } from "@/lib/shared/api-validation";

const patchSchema = z.object({
  paymentStatus: z.string().optional(),
  note: z.string().optional(),
  assignedTo: z.string().optional(),
  stage: z.string().optional(),
});

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const { orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }

  const current = await getOrderById(orderId);
  if (!current) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.success) return parsed.response;

  const patch: Partial<AdminOrder> = {};
  if (typeof parsed.data.paymentStatus === "string")
    patch.paymentStatus = parsed.data.paymentStatus;
  if (typeof parsed.data.note === "string") patch.note = parsed.data.note;
  if (typeof parsed.data.assignedTo === "string") patch.assignedTo = parsed.data.assignedTo.trim();
  if (typeof parsed.data.stage === "string") patch.stage = parsed.data.stage as OrderStage;

  const chainOrder = isChainOrder(current);
  if (chainOrder && (patch.stage || patch.paymentStatus)) {
    return NextResponse.json({ error: "订单状态由系统同步，禁止手动修改" }, { status: 409 });
  }
  if (patch.stage && !canTransitionStage(current.stage, patch.stage)) {
    return NextResponse.json({ error: "订单阶段不允许回退或跨越" }, { status: 409 });
  }

  if (patch.assignedTo && patch.assignedTo !== current.assignedTo) {
    const players = await listPlayers();
    const matched = players.find((p) => p.id === patch.assignedTo || p.name === patch.assignedTo);
    if (matched) {
      if (matched.status !== "可接单") {
        return NextResponse.json({ error: "陪练当前不可接单" }, { status: 400 });
      }
      const depositBase = matched.depositBase ?? 0;
      const depositLocked = matched.depositLocked ?? 0;
      if (depositBase > 0 && depositLocked < depositBase) {
        return NextResponse.json({ error: "陪练押金不足，无法派单" }, { status: 400 });
      }
      const available = matched.availableCredit ?? 0;
      if (current.amount > available) {
        return NextResponse.json(
          {
            error: `授信额度不足（可用 ${available} 元，订单 ${current.amount} 元）`,
          },
          { status: 400 }
        );
      }
      if (matched.address && !current.companionAddress) {
        patch.companionAddress = matched.address;
      }
      patch.meta = {
        ...(patch.meta || {}),
        driver: {
          name: matched.name,
          car: matched.role ? `擅长：${matched.role}` : "已接单",
          eta: "10分钟",
          tier: matched.role,
        },
      };
    }
  }
  if (patch.assignedTo === "" && current.assignedTo) {
    patch.meta = { ...(patch.meta || {}), driver: null };
  }

  const updated = await updateOrder(orderId, patch);
  if (!updated) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await recordAudit(req, auth, "orders.update", "order", orderId, patch);
  return NextResponse.json(updated);
}

export async function GET(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;
  const { orderId } = await params;
  if (!orderId) {
    return NextResponse.json({ error: "Missing orderId" }, { status: 400 });
  }
  const order = await getOrderById(orderId);
  if (!order) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(order);
}
