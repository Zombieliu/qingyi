import { NextResponse } from "next/server";
import { listPlayers } from "@/lib/admin-store";

export async function GET() {
  const players = await listPlayers();
  const available = players.filter((player) => {
    if (player.status !== "可接单") return false;
    const base = player.depositBase ?? 0;
    const locked = player.depositLocked ?? 0;
    return base <= 0 || locked >= base;
  });
  return NextResponse.json(
    available.map((player) => ({
      id: player.id,
      name: player.name,
      role: player.role,
      status: player.status,
    }))
  );
}
