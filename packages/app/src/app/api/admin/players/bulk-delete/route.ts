import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { removePlayers } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;

  let body: { ids?: string[] } = {};
  try {
    body = (await req.json()) as { ids?: string[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((id) => typeof id === "string" && id.trim()) : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }

  const count = await removePlayers(ids);
  await recordAudit(req, auth, "players.bulk_delete", "player", ids.join(","), { count, ids });
  return NextResponse.json({ ok: true, count });
}
