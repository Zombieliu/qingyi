import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { queryRedeemRecords } from "@/lib/admin/redeem-store";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const status = searchParams.get("status") || undefined;
  const q = searchParams.get("q") || undefined;
  const batchId = searchParams.get("batchId") || undefined;
  const codeId = searchParams.get("codeId") || undefined;
  const address = searchParams.get("address") || undefined;

  const result = await queryRedeemRecords({
    page,
    pageSize,
    status,
    q,
    batchId,
    codeId,
    address,
  });
  return NextResponse.json(result);
}
