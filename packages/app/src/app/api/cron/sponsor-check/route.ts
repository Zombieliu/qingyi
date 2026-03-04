import { isAuthorizedCron } from "@/lib/cron-auth";
import { NextResponse } from "next/server";
import { checkSponsorBalance } from "@/lib/chain/sponsor-monitor";
import { acquireCronLock } from "@/lib/cron-lock";
import { env } from "@/lib/env";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await acquireCronLock("sponsor-check", env.CRON_LOCK_TTL_MS))) {
    return NextResponse.json({ error: "locked" }, { status: 429 });
  }
  try {
    const result = await checkSponsorBalance();
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ error: "sponsor check failed" }, { status: 500 });
  }
}
