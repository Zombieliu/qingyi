import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { parseBody } from "@/lib/shared/api-validation";
import { prisma } from "@/lib/db";
import { recordAudit } from "@/lib/admin/admin-audit";

type RouteContext = { params: Promise<{ codeId: string }> };

function parseDate(value?: string | number | null) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber)) return new Date(asNumber);
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

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

  const data = {
    status: body.status,
    note: body.note,
    startsAt:
      body.startsAt === null
        ? null
        : body.startsAt !== undefined
          ? parseDate(body.startsAt)
          : undefined,
    expiresAt:
      body.expiresAt === null
        ? null
        : body.expiresAt !== undefined
          ? parseDate(body.expiresAt)
          : undefined,
    updatedAt: new Date(),
  };

  await prisma.redeemCode.update({
    where: { id: codeId },
    data,
  });

  await recordAudit(req, auth, "redeem.code.update", "redeem-code", codeId, {
    status: body.status,
  });

  return NextResponse.json({ ok: true });
}
