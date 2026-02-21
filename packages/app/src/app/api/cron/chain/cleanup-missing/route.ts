import { NextResponse } from "next/server";
import { fetchChainOrdersAdmin } from "@/lib/chain/chain-admin";
import { listChainOrdersForCleanup, removeOrders } from "@/lib/admin/admin-store";
import { computeMissingChainCleanup } from "@/lib/chain/chain-missing-utils";
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
  if (!(await acquireCronLock("chain-cleanup-missing", env.CRON_LOCK_TTL_MS))) {
    return NextResponse.json({ error: "locked" }, { status: 429 });
  }

  const enabled = env.CHAIN_MISSING_CLEANUP_ENABLED === "1";
  const maxAgeHours = env.CHAIN_MISSING_CLEANUP_MAX_AGE_HOURS;
  const maxDelete = Math.max(1, env.CHAIN_MISSING_CLEANUP_MAX);

  if (!enabled || !Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
    return NextResponse.json({ ok: true, enabled, deleted: 0 });
  }

  const [chainOrders, localOrders] = await Promise.all([
    fetchChainOrdersAdmin(),
    listChainOrdersForCleanup(),
  ]);
  const { ids, missing, eligible, cutoff, limit } = computeMissingChainCleanup({
    chainOrders,
    localOrders,
    maxAgeHours,
    maxDelete,
    chainOnly: true,
  });
  const deleted = ids.length ? await removeOrders(ids) : 0;

  return NextResponse.json({
    ok: true,
    enabled,
    maxAgeHours,
    cutoff,
    maxDelete: limit,
    chainCount: chainOrders.length,
    missingCount: missing.length,
    eligibleCount: eligible.length,
    deleted,
  });
}
