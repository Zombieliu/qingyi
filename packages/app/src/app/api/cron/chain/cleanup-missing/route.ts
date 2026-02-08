import { NextResponse } from "next/server";
import { fetchChainOrdersAdmin } from "@/lib/chain-admin";
import { listOrders, removeOrders } from "@/lib/admin-store";

function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET;
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

  const enabled = process.env.CHAIN_MISSING_CLEANUP_ENABLED === "1";
  const maxAgeHours = Number(process.env.CHAIN_MISSING_CLEANUP_MAX_AGE_HOURS || "0");
  const maxDelete = Math.max(1, Number(process.env.CHAIN_MISSING_CLEANUP_MAX || "500"));

  if (!enabled || !Number.isFinite(maxAgeHours) || maxAgeHours <= 0) {
    return NextResponse.json({ ok: true, enabled, deleted: 0 });
  }

  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;

  const [chainOrders, localOrders] = await Promise.all([fetchChainOrdersAdmin(), listOrders()]);
  const chainIds = new Set(chainOrders.map((order) => order.orderId));
  const missingChain = localOrders.filter(
    (order) => /^[0-9]+$/.test(order.id) && !chainIds.has(order.id)
  );

  const eligible = missingChain.filter((order) => {
    if (order.source !== "chain") return false;
    if (!Number.isFinite(order.createdAt)) return false;
    return order.createdAt < cutoff;
  });

  const ids = eligible.slice(0, maxDelete).map((order) => order.id);
  const deleted = ids.length ? await removeOrders(ids) : 0;

  return NextResponse.json({
    ok: true,
    enabled,
    maxAgeHours,
    cutoff,
    chainCount: chainOrders.length,
    missingCount: missingChain.length,
    eligibleCount: eligible.length,
    deleted,
  });
}
