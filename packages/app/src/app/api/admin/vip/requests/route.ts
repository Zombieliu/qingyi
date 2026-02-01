import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { queryMembershipRequests } from "@/lib/admin-store";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const status = searchParams.get("status") || "";
  const q = searchParams.get("q") || "";

  const result = await queryMembershipRequests({ page, pageSize, status, q });
  return NextResponse.json(result);
}
