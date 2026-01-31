import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getAdminStats } from "@/lib/admin-store";

export async function GET() {
  const auth = requireAdmin();
  if (!auth.ok) return auth.response;
  const stats = await getAdminStats();
  return NextResponse.json(stats);
}
