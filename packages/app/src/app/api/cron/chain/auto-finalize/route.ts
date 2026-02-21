import { isAuthorizedCron } from "@/lib/cron-auth";
import { NextResponse } from "next/server";
import { autoFinalizeChainOrdersSummary } from "@/lib/chain/chain-auto-finalize";
import { acquireCronLock } from "@/lib/cron-lock";
import { env } from "@/lib/env";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await acquireCronLock("chain-auto-finalize", env.CRON_LOCK_TTL_MS))) {
    return NextResponse.json({ error: "locked" }, { status: 429 });
  }
  try {
    const result = await autoFinalizeChainOrdersSummary();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "auto finalize failed" },
      { status: 500 }
    );
  }
}
