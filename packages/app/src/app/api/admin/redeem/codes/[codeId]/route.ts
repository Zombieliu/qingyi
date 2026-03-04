import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { parseBody } from "@/lib/shared/api-validation";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseOptionalDateInput } from "@/lib/edge-db/date-normalization";
import { updateRedeemCodeByIdEdgeWrite } from "@/lib/edge-db/redeem-write-store";

type RouteContext = { params: Promise<{ codeId: string }> };

const patchSchema = z.object({
  status: z.enum(["active", "disabled", "exhausted", "expired"]).optional(),
  note: z.string().optional(),
  startsAt: z.union([z.string(), z.number()]).optional().nullable(),
  expiresAt: z.union([z.string(), z.number()]).optional().nullable(),
});

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const { codeId } = await params;
  if (!codeId) {
    return NextResponse.json({ error: "codeId required" }, { status: 400 });
  }

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  await updateRedeemCodeByIdEdgeWrite({
    codeId,
    status: body.status,
    note: body.note,
    startsAt:
      body.startsAt === null
        ? null
        : body.startsAt !== undefined
          ? parseOptionalDateInput(body.startsAt)
          : undefined,
    expiresAt:
      body.expiresAt === null
        ? null
        : body.expiresAt !== undefined
          ? parseOptionalDateInput(body.expiresAt)
          : undefined,
    updatedAt: new Date(),
  });

  await recordAudit(req, auth, "redeem.code.update", "redeem-code", codeId, {
    status: body.status,
  });

  return NextResponse.json({ ok: true });
}
