import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { listE2eOrderIds, removeOrders } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  let body: { dryRun?: boolean } = {};
  try {
    body = (await req.json()) as { dryRun?: boolean };
  } catch {
    body = {};
  }

  const ids = await listE2eOrderIds();
  if (body.dryRun) {
    return NextResponse.json({ ok: true, candidates: ids.length, deleted: 0 });
  }
  const deleted = await removeOrders(ids);
  await recordAudit(req, auth, "orders.cleanup_e2e", "order", ids.join(","), { candidates: ids.length, deleted });
  return NextResponse.json({ ok: true, candidates: ids.length, deleted });
}
