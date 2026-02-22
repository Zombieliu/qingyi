import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { resolveDispute } from "@/lib/services/dispute-service";
import { parseBody } from "@/lib/shared/api-validation";
import { z } from "zod";

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
    return NextResponse.json(dispute);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "处理争议失败";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
