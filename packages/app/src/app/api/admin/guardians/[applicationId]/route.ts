import { NextResponse } from "next/server";
import crypto from "crypto";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { addPlayer, getPlayerByAddress, removeGuardianApplication, updateGuardianApplication } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import type { AdminGuardianApplication } from "@/lib/admin/admin-types";

type RouteContext = { params: Promise<{ applicationId: string }> };

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  let body: Partial<AdminGuardianApplication> = {};
  try {
    body = (await req.json()) as Partial<AdminGuardianApplication>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { applicationId } = await params;
  const updated = await updateGuardianApplication(applicationId, {
    status: body.status,
    note: body.note,
  });
  if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (updated.status === "已通过") {
    const addressRaw = (updated.userAddress || "").trim();
    const normalized = addressRaw ? normalizeSuiAddress(addressRaw) : "";
    if (normalized && isValidSuiAddress(normalized)) {
      const existing = await getPlayerByAddress(normalized);
      if (!existing.player && !existing.conflict) {
        const name =
          (updated.user || "").trim() ||
          (updated.contact || "").trim() ||
          "陪练";
        const noteParts: string[] = [];
        if (updated.games) noteParts.push(`擅长游戏：${updated.games}`);
        if (updated.experience) noteParts.push(`段位经验：${updated.experience}`);
        if (updated.availability) noteParts.push(`可接单时段：${updated.availability}`);
        if (updated.note) noteParts.push(`申请备注：${updated.note}`);
        const notes = noteParts.length > 0 ? noteParts.join("\n") : undefined;
        await addPlayer({
          id: `PLY-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
          name,
          role: updated.games || undefined,
          contact: updated.contact || undefined,
          address: normalized,
          depositBase: 0,
          depositLocked: 0,
          creditMultiplier: 1,
          status: "忙碌",
          notes,
          createdAt: Date.now(),
        });
      }
    }
  }

  await recordAudit(req, auth, "guardians.update", "guardian", applicationId, {
    status: updated.status,
  });

  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "admin" });
  if (!auth.ok) return auth.response;

  const { applicationId } = await params;
  const ok = await removeGuardianApplication(applicationId);
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });

  await recordAudit(req, auth, "guardians.delete", "guardian", applicationId);
  return NextResponse.json({ ok: true });
}
