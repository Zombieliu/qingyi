import { NextResponse } from "next/server";
import { getDuoOrderById, releaseDuoSlot, updateDuoOrder } from "@/lib/admin/duo-order-store";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { z } from "zod";
import { parseBodyRaw } from "@/lib/shared/api-validation";
import { apiBadRequest, apiForbidden, apiNotFound, apiError } from "@/lib/shared/api-response";
import { publishOrderEvent } from "@/lib/realtime";
import { adminReleaseDuoSlot } from "@/lib/chain/duo-chain-admin";

const releaseSchema = z.object({
  companionAddress: z.string().min(1),
  newCompanion: z.string().optional(),
  chainDigest: z.string().optional(),
});

type RouteContext = { params: Promise<{ orderId: string }> };

export async function POST(req: Request, { params }: RouteContext) {
  const { orderId } = await params;
  const order = await getDuoOrderById(orderId);
  if (!order) return apiNotFound("not found");

  const parsed = await parseBodyRaw(req, releaseSchema);
  if (!parsed.success) return parsed.response;
  const { data: body, rawBody } = parsed;

  const companion = normalizeSuiAddress(body.companionAddress);
  if (!isValidSuiAddress(companion)) return apiBadRequest("invalid companionAddress");

  // Determine which slot
  let slot: "A" | "B";
  if (order.companionAddressA === companion) {
    slot = "A";
  } else if (order.companionAddressB === companion) {
    slot = "B";
  } else {
    return apiBadRequest("companion not in any slot");
  }

  // Cannot release after completion (status >= 3)
  if (typeof order.chainStatus === "number" && order.chainStatus >= 3) {
    return apiError("order_already_completed", 409);
  }

  // Admin path
  const admin = await requireAdmin(req, { role: "viewer", requireOrigin: false, allowToken: true });
  if (admin.ok) {
    const slotNum = slot === "A" ? 0 : 1;
    const newCompanion = body.newCompanion ? normalizeSuiAddress(body.newCompanion) : undefined;
    if (newCompanion && !isValidSuiAddress(newCompanion)) {
      return apiBadRequest("invalid newCompanion");
    }

    // Chain call
    try {
      await adminReleaseDuoSlot({ orderId, slot: slotNum, newCompanion });
    } catch (e) {
      return apiError(`chain_error: ${(e as Error).message}`, 502);
    }

    // DB update
    const updated = await releaseDuoSlot(orderId, slot);
    if (!updated) return apiNotFound("not found");

    // If replacing, write new companion
    if (newCompanion) {
      const replaceField = slot === "A" ? "companionAddressA" : "companionAddressB";
      await updateDuoOrder(orderId, { [replaceField]: newCompanion });
    }

    // Notify
    if (order.userAddress) {
      void publishOrderEvent(order.userAddress, {
        type: "slot_released",
        orderId,
        stage: updated.stage,
        timestamp: Date.now(),
      });
    }

    return NextResponse.json(updated);
  }

  // Companion self-release path
  const auth = await requireUserAuth(req, {
    intent: `duo-orders:release:${orderId}`,
    address: companion,
    body: rawBody,
  });
  if (!auth.ok) return auth.response;

  // Require chainDigest when order has chain status (proves chain call succeeded)
  if (order.chainDigest || typeof order.chainStatus === "number") {
    if (!body.chainDigest) {
      return apiBadRequest("chainDigest required for chain orders");
    }
  }

  // DB update (chain call is done client-side by the companion)
  const updated = await releaseDuoSlot(orderId, slot);
  if (!updated) return apiNotFound("not found");

  // Store chain digest
  if (body.chainDigest) {
    await updateDuoOrder(orderId, { chainDigest: body.chainDigest });
  }

  // Notify order owner + released companion
  if (order.userAddress) {
    void publishOrderEvent(order.userAddress, {
      type: "slot_released",
      orderId,
      stage: updated.stage,
      timestamp: Date.now(),
    });
  }

  return NextResponse.json(updated);
}
