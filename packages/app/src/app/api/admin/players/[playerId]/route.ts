import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { getPlayerByAddress, removePlayer, updatePlayer } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseBody } from "@/lib/shared/api-validation";
import type { PlayerStatus } from "@/lib/admin/admin-types";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";

const patchSchema = z.object({
  name: z.string().optional(),
  role: z.string().optional(),
  contact: z.string().optional(),
  address: z.string().optional(),
  wechatQr: z.string().optional(),
  alipayQr: z.string().optional(),
  depositBase: z.number().optional(),
  depositLocked: z.number().optional(),
  creditMultiplier: z.number().optional(),
  notes: z.string().optional(),
  status: z.enum(["可接单", "忙碌", "停用"]).optional(),
});

function normalizePlayerAddress(raw?: string | null) {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  try {
    const normalized = normalizeSuiAddress(trimmed);
    if (!isValidSuiAddress(normalized)) return null;
    return normalized;
  } catch {
    return null;
  }
}

function isMobileNumber(value: string) {
  return /^1\d{10}$/.test(value);
}

type RouteContext = {
  params: Promise<{ playerId: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;

  const { playerId } = await params;
  if (!playerId) {
    return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
  }

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const patch: z.infer<typeof patchSchema> & { status?: PlayerStatus } = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.role !== undefined) patch.role = body.role;
  if (body.contact !== undefined) {
    const contact = body.contact.trim();
    if (!contact) {
      return NextResponse.json({ error: "contact_required" }, { status: 400 });
    }
    if (!isMobileNumber(contact)) {
      return NextResponse.json({ error: "invalid_contact" }, { status: 400 });
    }
    patch.contact = contact;
  }
  if (body.address !== undefined) {
    const rawAddress = body.address.trim();
    if (!rawAddress) {
      patch.address = "";
    } else {
      const normalized = normalizePlayerAddress(rawAddress);
      if (!normalized) {
        return NextResponse.json({ error: "invalid_address" }, { status: 400 });
      }
      const existing = await getPlayerByAddress(normalized);
      if (existing.conflict || (existing.player && existing.player.id !== playerId)) {
        return NextResponse.json({ error: "address_in_use" }, { status: 409 });
      }
      patch.address = normalized;
    }
  }
  if (body.wechatQr !== undefined) patch.wechatQr = body.wechatQr;
  if (body.alipayQr !== undefined) patch.alipayQr = body.alipayQr;
  if (body.depositBase !== undefined) patch.depositBase = body.depositBase;
  if (body.depositLocked !== undefined) patch.depositLocked = body.depositLocked;
  if (body.creditMultiplier !== undefined) patch.creditMultiplier = body.creditMultiplier;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.status !== undefined) patch.status = body.status as PlayerStatus;

  if (patch.depositBase !== undefined && patch.depositBase < 0) {
    return NextResponse.json({ error: "depositBase must be >= 0" }, { status: 400 });
  }
  if (patch.depositLocked !== undefined && patch.depositLocked < 0) {
    return NextResponse.json({ error: "depositLocked must be >= 0" }, { status: 400 });
  }
  if (patch.creditMultiplier !== undefined) {
    patch.creditMultiplier = Math.min(5, Math.max(1, Math.round(patch.creditMultiplier)));
  }

  const updated = await updatePlayer(playerId, patch);
  if (!updated) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await recordAudit(req, auth, "players.update", "player", playerId, patch);
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;

  const { playerId } = await params;
  if (!playerId) {
    return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
  }

  const removed = await removePlayer(playerId);
  if (!removed) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await recordAudit(req, auth, "players.delete", "player", playerId);
  return NextResponse.json({ ok: true });
}
