import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { requestMantouWithdraw } from "@/lib/admin-store";

export async function POST(req: Request) {
  let payload: { address?: string; amount?: number; account?: string; note?: string } = {};
  try {
    payload = (await req.json()) as { address?: string; amount?: number; account?: string; note?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = normalizeSuiAddress(payload.address || "");
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  const amount = Number(payload.amount || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be positive integer" }, { status: 400 });
  }
  const account = String(payload.account || "").trim();
  if (!account) {
    return NextResponse.json({ error: "account required" }, { status: 400 });
  }

  try {
    const result = await requestMantouWithdraw({
      address,
      amount,
      account,
      note: payload.note ? String(payload.note).trim() : undefined,
    });
    return NextResponse.json({ ok: true, request: result.request, wallet: result.wallet });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "withdraw failed" }, { status: 500 });
  }
}
