import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { listE2eOrderIds, removeOrders } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseBody } from "@/lib/shared/api-validation";

const schema = z.object({ dryRun: z.boolean().optional() }).default({});

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, schema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const ids = await listE2eOrderIds();
  if (body.dryRun) {
    return NextResponse.json({ ok: true, candidates: ids.length, deleted: 0 });
  }
  const deleted = await removeOrders(ids);
  await recordAudit(req, auth, "orders.cleanup_e2e", "order", ids.join(","), {
    candidates: ids.length,
    deleted,
  });
  return NextResponse.json({ ok: true, candidates: ids.length, deleted });
}
