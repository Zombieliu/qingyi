import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { z } from "zod";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { parseBodyRaw } from "@/lib/shared/api-validation";
import { apiBadRequest, apiForbidden, apiInternalError } from "@/lib/shared/api-response";
import { markCompletedAdmin } from "@/lib/chain/chain-admin";
import { findChainOrder, syncChainOrder } from "@/lib/chain/chain-sync";

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
  if (!address || !isValidSuiAddress(address)) {
    return apiBadRequest("invalid address");
  }

  const auth = await requireUserAuth(req, {
    intent: `chain:mark-completed:${payload.orderId}`,
    address,
    body: rawBody,
  });
  if (!auth.ok) return auth.response;

  const chainOrder = await findChainOrder(payload.orderId, true);
  if (!chainOrder) {
    return NextResponse.json({ error: "chain_order_not_found" }, { status: 404 });
  }
  if (chainOrder.status !== 2) {
    return NextResponse.json(
      { error: "invalid_status", currentStatus: chainOrder.status },
      { status: 400 }
    );
  }
  if (normalizeSuiAddress(chainOrder.companion) !== address) {
    return apiForbidden("not the companion of this order");
  }

  try {
    const result = await markCompletedAdmin(payload.orderId);
    await syncChainOrder(payload.orderId);
    return NextResponse.json({ ok: true, digest: result.digest });
  } catch (error) {
    return apiInternalError(error);
  }
}
