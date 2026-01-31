import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { removePlayer, updatePlayer } from "@/lib/admin-store";
import type { AdminPlayer, PlayerStatus } from "@/lib/admin-types";

type RouteContext = {
  params: Promise<{ playerId: string }>;
};

export async function PATCH(
  req: Request,
  { params }: RouteContext
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { playerId } = await params;
  if (!playerId) {
    return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
  }

  let body: Partial<AdminPlayer> = {};
  try {
    body = (await req.json()) as Partial<AdminPlayer>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Partial<AdminPlayer> = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.role === "string") patch.role = body.role;
  if (typeof body.contact === "string") patch.contact = body.contact;
  if (typeof body.notes === "string") patch.notes = body.notes;
  if (typeof body.status === "string") patch.status = body.status as PlayerStatus;

  const updated = await updatePlayer(playerId, patch);
  if (!updated) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: RouteContext
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { playerId } = await params;
  if (!playerId) {
    return NextResponse.json({ error: "Missing playerId" }, { status: 400 });
  }

  const removed = await removePlayer(playerId);
  if (!removed) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
