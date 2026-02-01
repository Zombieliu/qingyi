import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminStats } from "@/lib/admin-store";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;
  const stats = await getAdminStats();
  return NextResponse.json(stats);
}
