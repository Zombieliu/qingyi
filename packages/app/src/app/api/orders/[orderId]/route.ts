import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { getOrderById, getPlayerByAddress, updateOrder, updateOrderIfUnassigned } from "@/lib/admin/admin-store";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { canTransitionStage, isChainOrder } from "@/lib/order-guard";
import type { AdminOrder } from "@/lib/admin/admin-types";
import { requireUserAuth } from "@/lib/auth/user-auth";

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
    const auth = await requireUserAuth(req, { intent: `orders:read:${orderId}`, address: normalized });
    if (!auth.ok) return auth.response;
    if (order.userAddress && order.userAddress !== normalized && order.companionAddress !== normalized) {
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

  let rawBody = "";
  let body: Partial<AdminOrder> & {
    userAddress?: string;
    companionAddress?: string;
    status?: string;
    meta?: Record<string, unknown>;
  } = {};
  try {
    rawBody = await req.text();
    body = rawBody ? (JSON.parse(rawBody) as Partial<AdminOrder> & { userAddress?: string; status?: string }) : {};
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
      return NextResponse.json({ error: "订单状态由系统同步，禁止手动修改" }, { status: 409 });
    }
    if (patch.stage && !canTransitionStage(order.stage, patch.stage)) {
      return NextResponse.json({ error: "订单阶段不允许回退或跨越" }, { status: 409 });
    }

    const updated = await updateOrder(orderId, patch);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(updated);
  }

  const actorRaw =
    typeof body.userAddress === "string"
      ? body.userAddress
      : typeof body.companionAddress === "string"
        ? body.companionAddress
        : "";
  if (!actorRaw) {
    return NextResponse.json({ error: "userAddress required" }, { status: 401 });
  }
  const actor = normalizeSuiAddress(actorRaw);
  if (!isValidSuiAddress(actor)) {
    return NextResponse.json({ error: "invalid userAddress" }, { status: 400 });
  }

  const companionRaw = typeof body.companionAddress === "string" ? body.companionAddress : "";
  let companionIsAssignee = false;
  if (companionRaw) {
    const companion = normalizeSuiAddress(companionRaw);
    if (!isValidSuiAddress(companion)) {
      return NextResponse.json({ error: "invalid companionAddress" }, { status: 400 });
    }
    if (order.userAddress && order.userAddress === companion) {
      return NextResponse.json({ error: "cannot accept own order" }, { status: 403 });
    }
    if (companion !== actor) {
      return NextResponse.json({ error: "companionAddress must match userAddress" }, { status: 400 });
    }
    if (order.companionAddress) {
      if (order.companionAddress !== companion) {
        return NextResponse.json({ error: "order already accepted" }, { status: 409 });
      }
      companionIsAssignee = true;
    }
  } else if (order.userAddress && order.userAddress !== actor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const auth = await requireUserAuth(req, {
    intent: `orders:patch:${orderId}`,
    address: actor,
    body: rawBody,
  });
  if (!auth.ok) return auth.response;

  if (companionRaw) {
    const playerLookup = await getPlayerByAddress(actor);
    if (!playerLookup.player || playerLookup.conflict || playerLookup.player.status === "停用") {
      return NextResponse.json({ error: "player_required" }, { status: 403 });
    }
  }

  const patch: Partial<AdminOrder> = { meta: body.meta || {} };
  if (companionRaw) {
    patch.companionAddress = normalizeSuiAddress(companionRaw);
  }
  if (typeof body.status === "string") {
    const stage = mapStatusToStage(body.status);
    if (chainOrder && stage) {
      return NextResponse.json({ error: "订单状态由系统同步，禁止手动修改" }, { status: 409 });
    }
    (patch.meta as Record<string, unknown>).status = body.status;
    if (!chainOrder && stage) patch.stage = stage as AdminOrder["stage"];
  }

  if (patch.stage && !canTransitionStage(order.stage, patch.stage)) {
    return NextResponse.json({ error: "订单阶段不允许回退或跨越" }, { status: 409 });
  }

  const updated = companionRaw
    ? companionIsAssignee
      ? await updateOrder(orderId, patch)
      : await updateOrderIfUnassigned(orderId, patch)
    : await updateOrder(orderId, patch);
  if (!updated) {
    if (companionRaw && !companionIsAssignee) {
      return NextResponse.json({ error: "order already accepted" }, { status: 409 });
    }
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const admin = await requireAdmin(req, { role: "ops", requireOrigin: false });
  if (!admin.ok) return admin.response;
  const { orderId } = await params;
  const order = await getOrderById(orderId);
  if (!order) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (isChainOrder(order)) {
    return NextResponse.json({ error: "订单状态由系统同步，禁止手动修改" }, { status: 409 });
  }
  const updated = await updateOrder(orderId, { stage: "已取消" });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
