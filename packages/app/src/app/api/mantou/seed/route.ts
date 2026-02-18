import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { creditMantou } from "@/lib/admin/admin-store";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  let payload: { address?: string; amount?: number; note?: string } = {};
  try {
    payload = (await req.json()) as { address?: string; amount?: number; note?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const address = normalizeSuiAddress(payload.address || "");
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  const amount = Math.floor(Number(payload.amount || 0));
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "amount must be positive integer" }, { status: 400 });
  }

  try {
    const result = await creditMantou({
      address,
      amount,
      orderId: `seed-${Date.now()}`,
      note: payload.note ? String(payload.note).trim() : "e2e seed",
    });
    return NextResponse.json({ ok: true, wallet: result.wallet });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "seed failed" }, { status: 500 });
  }
}
