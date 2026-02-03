import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { resolveDisputeAdmin } from "@/lib/chain-admin";
import { syncChainOrder } from "@/lib/chain-sync";
import { recordAudit } from "@/lib/admin-audit";

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  let body: { orderId?: string; serviceRefundBps?: number; depositSlashBps?: number } = {};
  try {
    body = (await req.json()) as { orderId?: string; serviceRefundBps?: number; depositSlashBps?: number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const orderId = body.orderId?.trim() || "";
  const serviceRefundBps = Number(body.serviceRefundBps ?? NaN);
  const depositSlashBps = Number(body.depositSlashBps ?? NaN);
  if (!orderId) {
    return NextResponse.json({ error: "orderId required" }, { status: 400 });
  }
  if (!Number.isFinite(serviceRefundBps) || !Number.isFinite(depositSlashBps)) {
    return NextResponse.json({ error: "bps required" }, { status: 400 });
  }

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
    return NextResponse.json({ ok: true, digest: result.digest, effects: result.effects });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "resolve failed" }, { status: 500 });
  }
}
