import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { listChannels } from "@/lib/services/growth-os-service";
import { prisma } from "@/lib/db";

/** GET /api/growth/channels */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if ("status" in auth) return auth;

  const channels = await listChannels();
  return NextResponse.json(channels);
}

/** POST /api/growth/channels — create or update channel */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, { role: "admin" });
  if ("status" in auth) return auth;

  const body = await req.json();
  const { code, name, icon, color, monthlyBudget } = body;

  if (!code || !name) {
    return NextResponse.json({ error: "code and name required" }, { status: 400 });
  }

  const channel = await prisma.growthChannel.upsert({
    where: { code },
    create: { code, name, icon, color, monthlyBudget },
    update: { name, icon, color, monthlyBudget },
  });

  return NextResponse.json(channel);
}
