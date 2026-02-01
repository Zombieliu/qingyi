import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin-auth";
import { addPlayer, listPlayers } from "@/lib/admin-store";
import { recordAudit } from "@/lib/admin-audit";
import type { AdminPlayer, PlayerStatus } from "@/lib/admin-types";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;
  const players = await listPlayers();
  return NextResponse.json(players);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  let body: Partial<AdminPlayer> = {};
  try {
    body = (await req.json()) as Partial<AdminPlayer>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }

  const player: AdminPlayer = {
    id: body.id || `PLY-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    name: body.name,
    role: body.role,
    contact: body.contact,
    status: (body.status as PlayerStatus) || "可接单",
    notes: body.notes,
    createdAt: Date.now(),
  };

  await addPlayer(player);
  await recordAudit(req, auth, "players.create", "player", player.id, {
    name: player.name,
    status: player.status,
  });
  return NextResponse.json(player, { status: 201 });
}
