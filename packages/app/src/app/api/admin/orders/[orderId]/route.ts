import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getOrderById, listPlayers, updateOrder } from "@/lib/admin-store";
import { recordAudit } from "@/lib/admin-audit";
import { canTransitionStage, isChainOrder } from "@/lib/order-guard";
import type { AdminOrder, OrderStage } from "@/lib/admin-types";

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

export async function PATCH(
  req: Request,
  { params }: RouteContext
) {
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

  let body: Partial<AdminOrder> = {};
  try {
    body = (await req.json()) as Partial<AdminOrder>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Partial<AdminOrder> = {};
  if (typeof body.paymentStatus === "string") patch.paymentStatus = body.paymentStatus;
  if (typeof body.note === "string") patch.note = body.note;
  if (typeof body.assignedTo === "string") patch.assignedTo = body.assignedTo.trim();
  if (typeof body.stage === "string") patch.stage = body.stage as OrderStage;

  const chainOrder = isChainOrder(current);
  if (chainOrder && (patch.stage || patch.paymentStatus)) {
    return NextResponse.json({ error: "链上订单状态由链上同步，禁止手动修改" }, { status: 409 });
  }
  if (patch.stage && !canTransitionStage(current.stage, patch.stage)) {
    return NextResponse.json({ error: "订单阶段不允许回退或跨越" }, { status: 409 });
  }

  if (patch.assignedTo && patch.assignedTo !== current.assignedTo) {
    const players = await listPlayers();
    const matched = players.find((p) => p.id === patch.assignedTo || p.name === patch.assignedTo);
    if (matched) {
      if (matched.status !== "可接单") {
        return NextResponse.json({ error: "打手当前不可接单" }, { status: 400 });
      }
      const depositBase = matched.depositBase ?? 0;
      const depositLocked = matched.depositLocked ?? 0;
      if (depositBase > 0 && depositLocked < depositBase) {
        return NextResponse.json({ error: "打手押金不足，无法派单" }, { status: 400 });
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

export async function GET(
  req: Request,
  { params }: RouteContext
) {
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
