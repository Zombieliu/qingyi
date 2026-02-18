import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { queryReferrals } from "@/lib/admin/admin-store";

export async function GET(req: Request) {
  const admin = await requireAdmin(req, { role: "viewer" });
  if (!admin.ok) return admin.response;

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, Number(searchParams.get("page") || "1"));
  const pageSize = Math.min(100, Math.max(5, Number(searchParams.get("pageSize") || "20")));
  const status = searchParams.get("status") || undefined;
  const q = searchParams.get("q") || undefined;

  const result = await queryReferrals({ page, pageSize, status, q });
  return NextResponse.json(result);
}
