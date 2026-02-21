import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { removeMembershipTier, updateMembershipTier } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseBody } from "@/lib/shared/api-validation";

const perkItemSchema = z.union([
  z.string(),
  z.object({
    label: z.string(),
    desc: z.string().optional(),
  }),
]);

const perksSchema = z.union([z.string(), z.array(perkItemSchema)]).optional();

function parsePerks(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line) => {
    const [label, ...rest] = line.split("|");
    const desc = rest.join("|").trim();
    return desc ? { label: label.trim(), desc } : { label: label.trim() };
  });
}

function normalizePerks(input?: string | Array<string | { label: string; desc?: string }>) {
  if (typeof input === "string") return parsePerks(input);
  if (Array.isArray(input)) {
    return input.map((item) => (typeof item === "string" ? { label: item } : item));
  }
  return undefined;
}

const patchSchema = z.object({
  name: z.string().optional(),
  level: z.number().optional(),
  badge: z.string().optional(),
  price: z.number().optional(),
  durationDays: z.number().optional(),
  minPoints: z.number().optional(),
  status: z.enum(["上架", "下架"]).optional(),
  perks: perksSchema,
});

type RouteContext = { params: Promise<{ tierId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const { tierId } = await params;
  const perks = normalizePerks(body.perks);
  const updated = await updateMembershipTier(tierId, { ...body, perks });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit(req, auth, "vip.tier.update", "vip-tier", tierId, {
    status: updated.status,
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const { tierId } = await params;
  const ok = await removeMembershipTier(tierId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit(req, auth, "vip.tier.delete", "vip-tier", tierId);
  return NextResponse.json({ ok: true });
}
