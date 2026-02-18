import { NextResponse } from "next/server";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { queryLedgerRecords } from "@/lib/admin/admin-store";
import { requireUserAuth } from "@/lib/auth/user-auth";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = normalizeSuiAddress(searchParams.get("address") || "");
  if (!address || !isValidSuiAddress(address)) {
    return NextResponse.json({ error: "invalid address" }, { status: 400 });
  }
  const auth = await requireUserAuth(req, { intent: "ledger:records:read", address });
  if (!auth.ok) return auth.response;
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const result = await queryLedgerRecords({ address: auth.address, page, pageSize });
  return NextResponse.json(result);
}
