import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { creditMantou, getOrderById } from "@/lib/admin/admin-store";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { z } from "zod";
import { parseBodyRaw } from "@/lib/shared/api-validation";

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
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
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
    return NextResponse.json({ error: "order not found" }, { status: 404 });
  }
  if (!order.companionAddress || order.companionAddress !== address) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const meta = (order.meta || {}) as Record<string, unknown>;
  const diamondCharge = Number(meta.diamondCharge ?? 0);
  const amount = Math.floor(Number.isFinite(diamondCharge) ? diamondCharge : 0);
  if (amount <= 0) {
    return NextResponse.json({ error: "no diamond charge" }, { status: 400 });
  }

  try {
    const result = await creditMantou({
      address,
      amount,
      orderId,
      note: `来自订单 ${orderId} 的钻石兑换`,
    });
    return NextResponse.json({ ok: true, duplicated: result.duplicated, wallet: result.wallet });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message || "credit failed" },
      { status: 500 }
    );
  }
}
