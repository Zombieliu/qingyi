import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { listOrders, removeOrders } from "@/lib/admin-store";
import { fetchChainOrdersAdmin } from "@/lib/chain-admin";
import { recordAudit } from "@/lib/admin-audit";

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  try {
    const chainOrders = await fetchChainOrdersAdmin();
    const localOrders = await listOrders();
    const chainIds = new Set(chainOrders.map((order) => order.orderId));
    const missingChain = localOrders.filter(
      (order) => /^[0-9]+$/.test(order.id) && !chainIds.has(order.id)
    );
    const ids = missingChain.map((order) => order.id);
    const deleted = await removeOrders(ids);
    await recordAudit(req, auth, "chain.cleanup_missing", "order", ids.join(","), {
      candidates: ids.length,
      deleted,
    });
    return NextResponse.json({ ok: true, candidates: ids.length, deleted });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "cleanup failed" }, { status: 500 });
  }
}
