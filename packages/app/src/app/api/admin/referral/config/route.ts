import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { getReferralConfig, updateReferralConfig } from "@/lib/admin/admin-store";

export async function GET(req: Request) {
  const admin = await requireAdmin(req, { role: "viewer" });
  if (!admin.ok) return admin.response;
  const config = await getReferralConfig();
  return NextResponse.json(config);
}

export async function PUT(req: Request) {
  const admin = await requireAdmin(req, { role: "admin" });
  if (!admin.ok) return admin.response;

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const patch: Parameters<typeof updateReferralConfig>[0] = {};
  if (typeof payload.mode === "string" && (payload.mode === "fixed" || payload.mode === "percent")) {
    patch.mode = payload.mode;
  }
  if (typeof payload.fixedInviter === "number") patch.fixedInviter = Math.floor(payload.fixedInviter);
  if (typeof payload.fixedInvitee === "number") patch.fixedInvitee = Math.floor(payload.fixedInvitee);
  if (typeof payload.percentInviter === "number") patch.percentInviter = payload.percentInviter;
  if (typeof payload.percentInvitee === "number") patch.percentInvitee = payload.percentInvitee;
  if (typeof payload.enabled === "boolean") patch.enabled = payload.enabled;

  const config = await updateReferralConfig(patch);
  return NextResponse.json(config);
}
