import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { autoCancelChainOrders } from "@/lib/chain/chain-auto-cancel";
import { recordAudit } from "@/lib/admin/admin-audit";

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  let body: { dryRun?: boolean; limit?: number } = {};
  try {
    body = (await req.json()) as { dryRun?: boolean; limit?: number };
  } catch {
    body = {};
  }

  try {
    const result = await autoCancelChainOrders({
      dryRun: Boolean(body.dryRun),
      limit: body.limit,
    });
    await recordAudit(req, auth, "chain.auto_cancel", "order", undefined, {
      enabled: result.enabled,
      hours: result.hours,
      canceled: result.canceled,
      candidates: result.candidates,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message || "auto cancel failed" }, { status: 500 });
  }
}
