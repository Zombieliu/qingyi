import { NextResponse } from "next/server";
import { acquireCronLock } from "@/lib/cron-lock";
import { env } from "@/lib/env";
import { isAuthorizedCron } from "@/lib/cron-auth";
import {
  deleteAdminOrdersBeforeEdgeWrite,
  pruneTableByMaxRowsEdgeWrite,
} from "@/lib/edge-db/cron-maintenance-store";

export async function GET(req: Request) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!(await acquireCronLock("maintenance", env.CRON_LOCK_TTL_MS))) {
    return NextResponse.json({ error: "locked" }, { status: 429 });
  }
  const maxAudit = env.ADMIN_AUDIT_LOG_LIMIT;
  const maxPayments = env.ADMIN_PAYMENT_EVENT_LIMIT;
  const retentionDays = env.ORDER_RETENTION_DAYS;

  const [deletedAudit, deletedPayments] = await Promise.all([
    pruneTableByMaxRowsEdgeWrite("AdminAuditLog", maxAudit),
    pruneTableByMaxRowsEdgeWrite("AdminPaymentEvent", maxPayments),
  ]);
  let deletedOrders = 0;
  if (Number.isFinite(retentionDays) && retentionDays > 0) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    deletedOrders = await deleteAdminOrdersBeforeEdgeWrite(cutoff);
  }

  return NextResponse.json({ ok: true, deletedAudit, deletedPayments, deletedOrders });
}
