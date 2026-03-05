import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { queryReferrals } from "@/lib/admin/admin-store";
import { parseIntegerQueryParam } from "@/lib/shared/query-params";

export async function GET(req: Request) {
  const admin = await requireAdmin(req, { role: "viewer" });
  if (!admin.ok) return admin.response;

  const { searchParams } = new URL(req.url);
  const page = parseIntegerQueryParam(searchParams.get("page"), { fallback: 1, min: 1 });
  const pageSize = parseIntegerQueryParam(searchParams.get("pageSize"), {
    fallback: 20,
    min: 5,
    max: 100,
  });
  const status = searchParams.get("status") || undefined;
  const q = searchParams.get("q") || undefined;

  const result = await queryReferrals({ page, pageSize, status, q });
  return NextResponse.json(result);
}
