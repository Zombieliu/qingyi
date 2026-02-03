import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { creditMantou, getOrderById } from "@/lib/admin-store";

export async function POST(req: Request) {
  let payload: { address?: string; orderId?: string } = {};
  try {
    payload = (await req.json()) as { address?: string; orderId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = normalizeSuiAddress(payload.address || "");
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  const orderId = String(payload.orderId || "").trim();
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }

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
    return NextResponse.json({ error: (error as Error).message || "credit failed" }, { status: 500 });
  }
}
