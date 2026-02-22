import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { getAllFlags } from "@/lib/feature-flags";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;
  return NextResponse.json({ flags: getAllFlags() });
}
