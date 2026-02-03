import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getOrderById, updateOrder } from "@/lib/admin-store";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { canTransitionStage, isChainOrder } from "@/lib/order-guard";
import type { AdminOrder } from "@/lib/admin-types";

type RouteContext = {
  params: Promise<{ orderId: string }>;
};

function mapStatusToStage(status?: string) {
  if (!status) return undefined;
  if (status.includes("取消")) return "已取消";
  if (status.includes("完成")) return "已完成";
  if (status.includes("进行") || status.includes("派单") || status.includes("接单")) return "进行中";
  return undefined;
}

export async function GET(req: Request, { params }: RouteContext) {
  const { orderId } = await params;
  const order = await getOrderById(orderId);
  if (!order) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const userAddressRaw = new URL(req.url).searchParams.get("userAddress") || "";
  if (userAddressRaw) {
    const normalized = normalizeSuiAddress(userAddressRaw);
    if (!isValidSuiAddress(normalized)) {
      return NextResponse.json({ error: "invalid userAddress" }, { status: 400 });
    }
    if (order.userAddress && order.userAddress !== normalized) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return NextResponse.json(order);
  }

  const admin = await requireAdmin(req, { role: "viewer", requireOrigin: false });
  if (!admin.ok) return admin.response;
  return NextResponse.json(order);
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const { orderId } = await params;
  const order = await getOrderById(orderId);
  if (!order) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: Partial<AdminOrder> & { userAddress?: string; status?: string; meta?: Record<string, unknown> } = {};
  try {
    body = (await req.json()) as Partial<AdminOrder> & { userAddress?: string; status?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const chainOrder = isChainOrder(order);
  const admin = await requireAdmin(req, { role: "viewer", requireOrigin: false, allowToken: true });
  if (admin.ok) {
    const patch: Partial<AdminOrder> = {};
    if (typeof body.paymentStatus === "string") patch.paymentStatus = body.paymentStatus;
    if (typeof body.note === "string") patch.note = body.note;
    if (typeof body.assignedTo === "string") patch.assignedTo = body.assignedTo;
    if (typeof body.stage === "string") patch.stage = body.stage as AdminOrder["stage"];
    if (typeof body.user === "string") patch.user = body.user;
    if (typeof body.userAddress === "string") patch.userAddress = body.userAddress;
    if (typeof body.companionAddress === "string") patch.companionAddress = body.companionAddress;
    if (typeof body.chainDigest === "string") patch.chainDigest = body.chainDigest;
    if (typeof body.chainStatus === "number") patch.chainStatus = body.chainStatus;
    if (typeof body.serviceFee === "number") patch.serviceFee = body.serviceFee;
    if (typeof body.deposit === "number") patch.deposit = body.deposit;
    if (body.meta && typeof body.meta === "object") patch.meta = body.meta;

    if (chainOrder && (patch.stage || patch.paymentStatus || patch.chainStatus)) {
      return NextResponse.json({ error: "链上订单状态由链上同步，禁止手动修改" }, { status: 409 });
    }
    if (patch.stage && !canTransitionStage(order.stage, patch.stage)) {
      return NextResponse.json({ error: "订单阶段不允许回退或跨越" }, { status: 409 });
    }

    const updated = await updateOrder(orderId, patch);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(updated);
  }

  const userAddressRaw = typeof body.userAddress === "string" ? body.userAddress : "";
  if (!userAddressRaw) {
    return NextResponse.json({ error: "userAddress required" }, { status: 401 });
  }
  const normalized = normalizeSuiAddress(userAddressRaw);
  if (!isValidSuiAddress(normalized)) {
    return NextResponse.json({ error: "invalid userAddress" }, { status: 400 });
  }
  if (order.userAddress && order.userAddress !== normalized) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const patch: Partial<AdminOrder> = { meta: body.meta || {} };
  if (typeof body.status === "string") {
    const stage = mapStatusToStage(body.status);
    if (chainOrder && stage) {
      return NextResponse.json({ error: "链上订单状态由链上同步，禁止手动修改" }, { status: 409 });
    }
    (patch.meta as Record<string, unknown>).status = body.status;
    if (!chainOrder && stage) patch.stage = stage as AdminOrder["stage"];
  }

  if (patch.stage && !canTransitionStage(order.stage, patch.stage)) {
    return NextResponse.json({ error: "订单阶段不允许回退或跨越" }, { status: 409 });
  }

  const updated = await updateOrder(orderId, patch);
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const admin = await requireAdmin(req, { role: "ops", requireOrigin: false });
  if (!admin.ok) return admin.response;
  const { orderId } = await params;
  const order = await getOrderById(orderId);
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (isChainOrder(order)) {
    return NextResponse.json({ error: "链上订单状态由链上同步，禁止手动修改" }, { status: 409 });
  }
  const updated = await updateOrder(orderId, { stage: "已取消" });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
