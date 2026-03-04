import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import {
  listAdminDisputesEdgeRead,
  resolveDisputeEdgeWrite,
} from "@/lib/edge-db/dispute-admin-store";
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

const listQuerySchema = z.object({
  includeResolved: z.enum(["0", "1"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const query = Object.fromEntries(new URL(req.url).searchParams.entries());
  const parsed = listQuerySchema.safeParse(query);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid query" }, { status: 400 });
  }

  try {
    const items = await listAdminDisputesEdgeRead({
      includeResolved: parsed.data.includeResolved === "1",
      limit: parsed.data.limit ?? 50,
    });
    return NextResponse.json({ items });
  } catch (error) {
    const msg = error instanceof Error ? error.message : DisputeMessages.RESOLVE_FAILED;
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const body = await parseBody(req, resolveSchema);
  if (!body.success) return body.response;

  try {
    const dispute = await resolveDisputeEdgeWrite({
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
