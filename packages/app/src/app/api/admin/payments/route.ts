import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { queryPaymentEvents } from "@/lib/admin-store";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(10, Number(searchParams.get("pageSize") || "30")));
  const result = await queryPaymentEvents({ page, pageSize });
  return NextResponse.json(result);
}
