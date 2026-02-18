import { NextResponse } from "next/server";
import { getLeaderboard } from "@/lib/admin/admin-store";
import type { LeaderboardType, LeaderboardPeriod } from "@/lib/admin/admin-types";

const VALID_TYPES: LeaderboardType[] = ["spend", "companion", "referral"];
const VALID_PERIODS: LeaderboardPeriod[] = ["all", "week", "month"];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const type = (searchParams.get("type") || "spend") as LeaderboardType;
  const period = (searchParams.get("period") || "all") as LeaderboardPeriod;

  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }
  if (!VALID_PERIODS.includes(period)) {
    return NextResponse.json({ error: "invalid period" }, { status: 400 });
  }

  const limit = Math.min(100, Math.max(10, Number(searchParams.get("limit") || "50")));
  const entries = await getLeaderboard(type, period, limit);
  return NextResponse.json({ type, period, entries });
}
