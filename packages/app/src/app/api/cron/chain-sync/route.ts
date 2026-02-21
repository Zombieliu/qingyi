import { NextResponse } from "next/server";
import { syncChainOrders } from "@/lib/chain/chain-sync";
import { acquireCronLock } from "@/lib/cron-lock";
import { env } from "@/lib/env";
import { trackCronFailed } from "@/lib/business-events";
import { isAuthorizedCron } from "@/lib/cron-auth";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await acquireCronLock("chain-sync", env.CRON_LOCK_TTL_MS))) {
    return NextResponse.json({ error: "locked" }, { status: 429 });
  }
  try {
    const result = await syncChainOrders();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    trackCronFailed("chain-sync", (e as Error).message || "sync failed");
    return NextResponse.json({ error: (e as Error).message || "sync failed" }, { status: 500 });
  }
}
