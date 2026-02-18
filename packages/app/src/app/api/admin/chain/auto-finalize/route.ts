import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { autoFinalizeChainOrdersSummary } from "@/lib/chain/chain-auto-finalize";
import { recordAudit } from "@/lib/admin/admin-audit";

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  let body: { dryRun?: boolean; completeLimit?: number; finalizeLimit?: number } = {};
  try {
    body = (await req.json()) as { dryRun?: boolean; completeLimit?: number; finalizeLimit?: number };
  } catch {
    body = {};
  }

  try {
    const result = await autoFinalizeChainOrdersSummary({
      dryRun: Boolean(body.dryRun),
      completeLimit: body.completeLimit,
      finalizeLimit: body.finalizeLimit,
    });
    await recordAudit(req, auth, "chain.auto_finalize", "order", undefined, {
      complete: {
        enabled: result.complete.enabled,
        hours: result.complete.hours,
        completed: result.complete.completed,
        candidates: result.complete.candidates,
      },
      finalize: {
        enabled: result.finalize.enabled,
        finalized: result.finalize.finalized,
        candidates: result.finalize.candidates,
      },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "auto finalize failed" }, { status: 500 });
  }
}
