import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { resolveDisputeAdmin } from "@/lib/chain/chain-admin";
import { syncChainOrder } from "@/lib/chain/chain-sync";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseBody } from "@/lib/shared/api-validation";
import { closeDisputeTicket } from "@/lib/services/dispute-ticket-service";

const postSchema = z.object({
  orderId: z.string().trim().min(1),
  serviceRefundBps: z.number(),
  depositSlashBps: z.number(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, postSchema);
  if (!parsed.success) return parsed.response;
  const { orderId, serviceRefundBps, depositSlashBps } = parsed.data;

  try {
    const result = await resolveDisputeAdmin({
      orderId,
      serviceRefundBps,
      depositSlashBps,
    });
    await syncChainOrder(orderId);
    await recordAudit(req, auth, "chain.resolve_dispute", "order", orderId, {
      serviceRefundBps,
      depositSlashBps,
      digest: result.digest,
    });
    // best-effort: close the associated support ticket
    closeDisputeTicket(orderId, {
      resolution: `退服务费 ${serviceRefundBps}bps, 扣押金 ${depositSlashBps}bps`,
      digest: result.digest,
    }).catch(() => {});
    return NextResponse.json({ ok: true, digest: result.digest, effects: result.effects });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "resolve failed" }, { status: 500 });
  }
}
