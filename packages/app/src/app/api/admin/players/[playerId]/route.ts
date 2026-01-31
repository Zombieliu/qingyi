import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { removePlayer, updatePlayer } from "@/lib/admin-store";
import type { AdminPlayer, PlayerStatus } from "@/lib/admin-types";

export async function PATCH(
  req: Request,
  { params }: { params: { playerId: string } }
) {
  const auth = requireAdmin();
  if (!auth.ok) return auth.response;

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

  const updated = await updatePlayer(params.playerId, patch);
  if (!updated) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: { params: { playerId: string } }
) {
  const auth = requireAdmin();
  if (!auth.ok) return auth.response;

  const removed = await removePlayer(params.playerId);
  if (!removed) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
