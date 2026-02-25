import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { resolveDispute } from "@/lib/services/dispute-service";
import { parseBody } from "@/lib/shared/api-validation";
import { z } from "zod";
import { DisputeMessages } from "@/lib/shared/messages";
import { closeDisputeTicket } from "@/lib/services/dispute-ticket-service";

const resolveSchema = z.object({
  orderId: z.string().min(1),
  resolution: z.enum(["refund", "reject", "partial"]),
  refundAmount: z.number().min(0).optional(),
  note: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, resolveSchema);
  if (!body.success) return body.response;

  try {
    const dispute = await resolveDispute({
      ...body.data,
      reviewerRole: auth.role,
    });
    // best-effort: close the associated support ticket
    closeDisputeTicket(body.data.orderId, {
      resolution: `${body.data.resolution}${body.data.refundAmount ? ` ¥${body.data.refundAmount}` : ""}`,
    }).catch(() => {});
    return NextResponse.json(dispute);
  } catch (error) {
    const msg = error instanceof Error ? error.message : DisputeMessages.RESOLVE_FAILED;
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
