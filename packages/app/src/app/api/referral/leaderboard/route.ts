import { NextResponse } from "next/server";
import { getLeaderboardEdgeRead } from "@/lib/edge-db/public-read-store";
import type { LeaderboardType, LeaderboardPeriod } from "@/lib/admin/admin-types";
import { withApiHandler } from "@/lib/shared/api-handler";

const VALID_TYPES: LeaderboardType[] = ["spend", "companion", "referral"];
const VALID_PERIODS: LeaderboardPeriod[] = ["all", "week", "month"];

export const GET = withApiHandler(
  async (req: Request) => {
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
    const entries = await getLeaderboardEdgeRead(type, period, limit);
    return NextResponse.json({ type, period, entries });
  },
  { auth: "public" }
);
