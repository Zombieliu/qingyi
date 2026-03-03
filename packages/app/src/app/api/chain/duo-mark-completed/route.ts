import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { z } from "zod";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { parseBodyRaw } from "@/lib/shared/api-validation";
import { apiBadRequest, apiForbidden, apiInternalError } from "@/lib/shared/api-response";
import { markDuoCompletedAdmin } from "@/lib/chain/duo-chain-admin";
import { getDuoOrderById } from "@/lib/admin/duo-order-store";

const schema = z.object({
  orderId: z
    .string()
    .trim()
    .min(1)
    .regex(/^[0-9]+$/),
  address: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = await parseBodyRaw(req, schema);
  if (!parsed.success) return parsed.response;
  const { data: payload, rawBody } = parsed;

  const address = normalizeSuiAddress(payload.address);
  if (!address || !isValidSuiAddress(address)) return apiBadRequest("invalid address");

  const auth = await requireUserAuth(req, {
    intent: `chain:duo-mark-completed:${payload.orderId}`,
    address,
    body: rawBody,
  });
  if (!auth.ok) return auth.response;

  const order = await getDuoOrderById(payload.orderId);
  if (!order) return NextResponse.json({ error: "order_not_found" }, { status: 404 });

  // Only the user or a companion can trigger completion
  if (
    order.userAddress !== address &&
    order.companionAddressA !== address &&
    order.companionAddressB !== address
  ) {
    return apiForbidden("not a party of this order");
  }

  try {
    const result = await markDuoCompletedAdmin(payload.orderId);
    return NextResponse.json({ ok: true, digest: result.digest });
  } catch (error) {
    return apiInternalError(error);
  }
}
