import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { getMantouWallet } from "@/lib/admin-store";

export async function GET(req: Request) {
  const referer = req.headers.get("referer") || "";
  if (referer) {
    try {
      const url = new URL(referer);
      if (url.pathname.startsWith("/admin")) {
        return NextResponse.json({ ok: true, balance: 0, frozen: 0, skipped: true });
      }
    } catch {
      // ignore invalid referer
    }
  }
  const { searchParams } = new URL(req.url);
  const address = normalizeSuiAddress(searchParams.get("address") || "");
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  const wallet = await getMantouWallet(address);
  return NextResponse.json({ ok: true, balance: wallet.balance, frozen: wallet.frozen });
}
