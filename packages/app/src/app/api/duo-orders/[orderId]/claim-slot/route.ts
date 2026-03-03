import { NextResponse } from "next/server";
import { getDuoOrderById, claimDuoSlot } from "@/lib/admin/duo-order-store";
import { getPlayerByAddress } from "@/lib/admin/admin-store";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { requireUserAuth } from "@/lib/auth/user-auth";
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

const claimSchema = z.object({
  companionAddress: z.string().min(1),
});

type RouteContext = { params: Promise<{ orderId: string }> };

export async function POST(req: Request, { params }: RouteContext) {
  const { orderId } = await params;
  const order = await getDuoOrderById(orderId);
  if (!order) return apiNotFound("not found");

  const parsed = await parseBodyRaw(req, claimSchema);
  if (!parsed.success) return parsed.response;
  const { data: body, rawBody } = parsed;

  const companion = normalizeSuiAddress(body.companionAddress);
  if (!isValidSuiAddress(companion)) return apiBadRequest("invalid companionAddress");

  // Cannot claim own order
  if (order.userAddress && order.userAddress === companion) {
    return apiForbidden("cannot claim own order");
  }

  const auth = await requireUserAuth(req, {
    intent: `duo-orders:claim:${orderId}`,
    address: companion,
    body: rawBody,
  });
  if (!auth.ok) return auth.response;

  // Must be a registered player
  const playerLookup = await getPlayerByAddress(companion);
  if (!playerLookup.player || playerLookup.conflict || playerLookup.player.status === "停用") {
    return apiForbidden("player_required");
  }

  // Check slots available
  if (order.companionAddressA && order.companionAddressB) {
    return apiError("no_open_slot", 409);
  }
  if (order.companionAddressA === companion || order.companionAddressB === companion) {
    return apiError("already_claimed", 409);
  }

  const updated = await claimDuoSlot(orderId, companion);
  if (!updated) return apiError("slot_taken", 409);

  // Notify order owner
  if (order.userAddress) {
    void publishOrderEvent(order.userAddress, {
      type: "assigned",
      orderId,
      stage: updated.stage,
      timestamp: Date.now(),
    });
  }

  return NextResponse.json(updated);
}
