import { NextResponse } from "next/server";
import { autoCancelChainOrders } from "@/lib/chain/chain-auto-cancel";
import { acquireCronLock } from "@/lib/cron-lock";
import { env } from "@/lib/env";

function isAuthorized(req: Request) {
  const secret = env.CRON_SECRET;
  const vercelCron = req.headers.get("x-vercel-cron") === "1";
  if (vercelCron) return true;
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const url = new URL(req.url);
  const token = req.headers.get("x-cron-secret") || url.searchParams.get("token") || "";
  return token === secret;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await acquireCronLock("chain-auto-cancel", env.CRON_LOCK_TTL_MS))) {
    return NextResponse.json({ error: "locked" }, { status: 429 });
  }
  try {
    const result = await autoCancelChainOrders();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message || "auto cancel failed" },
      { status: 500 }
    );
  }
}
