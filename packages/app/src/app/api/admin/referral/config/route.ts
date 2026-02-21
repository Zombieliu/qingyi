import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { getReferralConfig, updateReferralConfig } from "@/lib/admin/admin-store";
import { parseBody } from "@/lib/shared/api-validation";

const putSchema = z.object({
  mode: z.enum(["fixed", "percent"]).optional(),
  fixedInviter: z.number().optional(),
  fixedInvitee: z.number().optional(),
  percentInviter: z.number().optional(),
  percentInvitee: z.number().optional(),
  enabled: z.boolean().optional(),
});

export async function GET(req: Request) {
  const admin = await requireAdmin(req, { role: "viewer" });
  if (!admin.ok) return admin.response;
  const config = await getReferralConfig();
  return NextResponse.json(config);
}

export async function PUT(req: Request) {
  const admin = await requireAdmin(req, { role: "admin" });
  if (!admin.ok) return admin.response;

  const parsed = await parseBody(req, putSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;

  const patch: Parameters<typeof updateReferralConfig>[0] = {};
  if (payload.mode !== undefined) patch.mode = payload.mode;
  if (payload.fixedInviter !== undefined) patch.fixedInviter = Math.floor(payload.fixedInviter);
  if (payload.fixedInvitee !== undefined) patch.fixedInvitee = Math.floor(payload.fixedInvitee);
  if (payload.percentInviter !== undefined) patch.percentInviter = payload.percentInviter;
  if (payload.percentInvitee !== undefined) patch.percentInvitee = payload.percentInvitee;
  if (payload.enabled !== undefined) patch.enabled = payload.enabled;

  const config = await updateReferralConfig(patch);
  return NextResponse.json(config);
}
