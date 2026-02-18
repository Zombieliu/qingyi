import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { listOrders, removeOrders } from "@/lib/admin/admin-store";
import { fetchChainOrdersAdmin } from "@/lib/chain/chain-admin";
import { recordAudit } from "@/lib/admin/admin-audit";
import { computeMissingChainCleanup } from "@/lib/chain/chain-missing-utils";

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  try {
    const chainOrders = await fetchChainOrdersAdmin();
    const localOrders = await listOrders();
    const { ids, missing } = computeMissingChainCleanup({
      chainOrders,
      localOrders,
      maxAgeHours: 0,
      chainOnly: false,
    });
    const deleted = await removeOrders(ids);
    await recordAudit(req, auth, "chain.cleanup_missing", "order", ids.join(","), {
      candidates: ids.length,
      deleted,
    });
    return NextResponse.json({ ok: true, candidates: missing.length, deleted });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "cleanup failed" }, { status: 500 });
  }
}
