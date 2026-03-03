import { NextResponse, after } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { getDuoOrderById, updateDuoOrder } from "@/lib/admin/duo-order-store";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { requireUserAuth } from "@/lib/auth/user-auth";
import type { DuoOrder } from "@/lib/admin/admin-types";
import { z } from "zod";
import { parseBodyRaw } from "@/lib/shared/api-validation";
import {
  apiBadRequest,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiError,
} from "@/lib/shared/api-response";
import { publishOrderEvent } from "@/lib/realtime";

const patchSchema = z.object({
  paymentStatus: z.string().optional(),
  note: z.string().optional(),
  stage: z.enum(["待处理", "已确认", "进行中", "已完成", "已取消"]).optional(),
  userAddress: z.string().optional(),
  companionAddressA: z.string().optional(),
  companionAddressB: z.string().optional(),
  chainDigest: z.string().optional(),
  chainStatus: z.number().optional(),
  serviceFee: z.number().optional(),
  depositPerCompanion: z.number().optional(),
  teamStatus: z.number().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

type RouteContext = { params: Promise<{ orderId: string }> };

export async function GET(req: Request, { params }: RouteContext) {
  const { orderId } = await params;
  const order = await getDuoOrderById(orderId);
  if (!order) return apiNotFound("not found");

  const userAddressRaw = new URL(req.url).searchParams.get("userAddress") || "";
  if (userAddressRaw) {
    const normalized = normalizeSuiAddress(userAddressRaw);
    if (!isValidSuiAddress(normalized)) return apiBadRequest("invalid userAddress");
    const auth = await requireUserAuth(req, {
      intent: `duo-orders:read:${orderId}`,
      address: normalized,
    });
    if (!auth.ok) return auth.response;
    if (
      order.userAddress &&
      order.userAddress !== normalized &&
      order.companionAddressA !== normalized &&
      order.companionAddressB !== normalized
    ) {
      return apiForbidden();
    }
    return NextResponse.json(order);
  }

  const admin = await requireAdmin(req, { role: "viewer", requireOrigin: false });
  if (!admin.ok) return admin.response;
  return NextResponse.json(order);
}

export async function PATCH(req: Request, { params }: RouteContext) {
  const { orderId } = await params;
  const order = await getDuoOrderById(orderId);
  if (!order) return apiNotFound("not found");

  const parsed = await parseBodyRaw(req, patchSchema);
  if (!parsed.success) return parsed.response;
  const { data: body, rawBody } = parsed;

  // Admin path
  const admin = await requireAdmin(req, { role: "viewer", requireOrigin: false, allowToken: true });
  if (admin.ok) {
    const patch: Partial<DuoOrder> = {};
    if (body.paymentStatus !== undefined) patch.paymentStatus = body.paymentStatus;
    if (body.note !== undefined) patch.note = body.note;
    if (body.stage !== undefined) patch.stage = body.stage as DuoOrder["stage"];
    if (body.chainDigest !== undefined) patch.chainDigest = body.chainDigest;
    if (body.chainStatus !== undefined) patch.chainStatus = body.chainStatus;
    if (body.serviceFee !== undefined) patch.serviceFee = body.serviceFee;
    if (body.depositPerCompanion !== undefined)
      patch.depositPerCompanion = body.depositPerCompanion;
    if (body.teamStatus !== undefined) patch.teamStatus = body.teamStatus;
    if (body.meta) patch.meta = body.meta;

    const updated = await updateDuoOrder(orderId, patch);
    if (!updated) return apiNotFound("not found");
    return NextResponse.json(updated);
  }

  // User path
  const actorRaw = body.userAddress || "";
  if (!actorRaw) return apiUnauthorized("userAddress required");
  const actor = normalizeSuiAddress(actorRaw);
  if (!isValidSuiAddress(actor)) return apiBadRequest("invalid userAddress");
  if (
    order.userAddress &&
    order.userAddress !== actor &&
    order.companionAddressA !== actor &&
    order.companionAddressB !== actor
  ) {
    return apiForbidden();
  }

  const auth = await requireUserAuth(req, {
    intent: `duo-orders:patch:${orderId}`,
    address: actor,
    body: rawBody,
  });
  if (!auth.ok) return auth.response;

  const patch: Partial<DuoOrder> = {};
  if (body.meta) patch.meta = body.meta;
  if (body.note !== undefined) patch.note = body.note;

  const updated = await updateDuoOrder(orderId, patch);
  if (!updated) return apiNotFound("not found");

  if (order.userAddress) {
    after(
      publishOrderEvent(order.userAddress, {
        type: "status_change",
        orderId,
        stage: updated.stage,
        timestamp: Date.now(),
      })
    );
  }
  return NextResponse.json(updated);
}
