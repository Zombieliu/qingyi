import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { getPlayerByAddress } from "@/lib/admin/admin-store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("address") || "";
  if (!raw) {
    return NextResponse.json({ error: "address_required" }, { status: 400 });
  }
  const address = normalizeSuiAddress(raw);
  if (!isValidSuiAddress(address)) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }
  const result = await getPlayerByAddress(address);
  const isGuardian = Boolean(result.player && result.player.status !== "停用");
  return NextResponse.json({ address, isGuardian });
}
