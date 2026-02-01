import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { queryAuditLogs } from "@/lib/admin-store";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(200, Math.max(10, Number(searchParams.get("pageSize") || "30")));
  const q = searchParams.get("q") || undefined;
  const result = await queryAuditLogs({ page, pageSize, q });
  return NextResponse.json(result);
}
