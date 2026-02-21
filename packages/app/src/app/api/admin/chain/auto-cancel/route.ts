import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { autoCancelChainOrders } from "@/lib/chain/chain-auto-cancel";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseBody } from "@/lib/shared/api-validation";

const postSchema = z
  .object({
    dryRun: z.boolean().optional(),
    limit: z.number().optional(),
  })
  .default({});

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "finance" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, postSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

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
    return NextResponse.json(
      { error: (e as Error).message || "auto cancel failed" },
      { status: 500 }
    );
  }
}
