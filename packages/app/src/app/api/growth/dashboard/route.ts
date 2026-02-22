import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import {
  getDashboardStats,
  getChannelPerformance,
  getAttributionPaths,
} from "@/lib/services/growth-os-service";

/** GET /api/growth/dashboard?days=7 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if ("status" in auth) return auth;

  const days = Number(req.nextUrl.searchParams.get("days")) || 7;
  const [stats, channels, paths] = await Promise.all([
    getDashboardStats(days),
    getChannelPerformance(days),
    getAttributionPaths(10),
  ]);

  return NextResponse.json({ stats, channels, paths });
}
