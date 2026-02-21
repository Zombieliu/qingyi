import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { addPlayer, getPlayerByAddress, listPlayers } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import { parseBody } from "@/lib/shared/api-validation";
import type { PlayerStatus } from "@/lib/admin/admin-types";
import { isValidSuiAddress, normalizeSuiAddress } from "@mysten/sui/utils";

const postSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  role: z.string().optional(),
  contact: z.string().regex(/^1\d{10}$/),
  address: z.string().min(1),
  wechatQr: z.string().optional(),
  alipayQr: z.string().optional(),
  depositBase: z.number().min(0).optional(),
  depositLocked: z.number().min(0).optional(),
  creditMultiplier: z.number().optional(),
  status: z.enum(["可接单", "忙碌", "停用"]).default("可接单"),
  notes: z.string().optional(),
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

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;
  const players = await listPlayers();
  return NextResponse.json(players);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, postSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const rawAddress = body.address.trim();
  const normalizedAddress = normalizePlayerAddress(rawAddress);
  if (!normalizedAddress) {
    return NextResponse.json({ error: "invalid_address" }, { status: 400 });
  }
  const existing = await getPlayerByAddress(normalizedAddress);
  if (existing.conflict || existing.player) {
    return NextResponse.json({ error: "address_in_use" }, { status: 409 });
  }

  const player = {
    id: body.id || `PLY-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    name: body.name,
    role: body.role,
    contact: body.contact,
    address: normalizedAddress,
    wechatQr: body.wechatQr,
    alipayQr: body.alipayQr,
    depositBase: body.depositBase,
    depositLocked: body.depositLocked,
    creditMultiplier: body.creditMultiplier,
    status: body.status as PlayerStatus,
    notes: body.notes,
    createdAt: Date.now(),
  };

  if (player.creditMultiplier !== undefined) {
    const clamped = Math.min(5, Math.max(1, Math.round(player.creditMultiplier)));
    player.creditMultiplier = clamped;
  }

  await addPlayer(player);
  await recordAudit(req, auth, "players.create", "player", player.id, {
    name: player.name,
    status: player.status,
  });
  return NextResponse.json(player, { status: 201 });
}
