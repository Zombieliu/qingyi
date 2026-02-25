import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { creditMantou, getOrderById } from "@/lib/admin/admin-store";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { z } from "zod";
import { parseBodyRaw } from "@/lib/shared/api-validation";
import {
  apiBadRequest,
  apiNotFound,
  apiForbidden,
  apiInternalError,
} from "@/lib/shared/api-response";
import { AdminMessages } from "@/lib/shared/messages";

const creditSchema = z.object({
  address: z.string().min(1),
  orderId: z.string().trim().min(1),
});

export async function POST(req: Request) {
  const parsed = await parseBodyRaw(req, creditSchema);
  if (!parsed.success) return parsed.response;
  const { data: payload, rawBody } = parsed;

  const address = normalizeSuiAddress(payload.address);
  if (!address || !isValidSuiAddress(address)) {
    return apiBadRequest("invalid address");
  }
  const orderId = payload.orderId;

  const auth = await requireUserAuth(req, {
    intent: `mantou:credit:${orderId}`,
    address,
    body: rawBody,
  });
  if (!auth.ok) return auth.response;

  const order = await getOrderById(orderId);
  if (!order) {
    return apiNotFound("order not found");
  }
  if (!order.companionAddress || order.companionAddress !== address) {
    return apiForbidden();
  }

  const meta = (order.meta || {}) as Record<string, unknown>;
  const diamondCharge = Number(meta.diamondCharge ?? 0);
  const amount = Math.floor(Number.isFinite(diamondCharge) ? diamondCharge : 0);
  if (amount <= 0) {
    return apiBadRequest("no diamond charge");
  }

  try {
    const result = await creditMantou({
      address,
      amount,
      orderId,
      note: AdminMessages.DIAMOND_EXCHANGE_NOTE(orderId),
    });
    return NextResponse.json({ ok: true, duplicated: result.duplicated, wallet: result.wallet });
  } catch (error) {
    return apiInternalError(error);
  }
}
