import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { isApprovedGuardianAddress } from "@/lib/admin-store";

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
  const isGuardian = await isApprovedGuardianAddress(address);
  return NextResponse.json({ address, isGuardian });
}
