import { NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/auth/user-auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const slotSchema = z.object({
  day: z.number().min(0).max(6), // 0=周日, 1=周一, ..., 6=周六
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
});

const scheduleSchema = z.object({
  address: z.string().min(1),
  slots: z.array(slotSchema).max(21), // max 3 slots per day
});

/**
 * GET /api/companion/schedule?address=xxx — 获取排班
 * PUT /api/companion/schedule — 更新排班
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = (searchParams.get("address") || "").trim();
  if (!address) {
    return NextResponse.json({ error: "address required" }, { status: 400 });
  }

  const auth = await requireUserAuth(req, { intent: "companion:schedule:read", address });
  if (!auth.ok) return auth.response;

  const player = await prisma.adminPlayer.findFirst({
    where: { address: auth.address },
    select: { schedule: true },
  });

  const schedule = (player?.schedule as { slots?: unknown[] } | null)?.slots || [];
  return NextResponse.json({ slots: schedule });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = scheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_schedule", details: parsed.error.issues },
      { status: 400 }
    );
  }

  const { address, slots } = parsed.data;
  const auth = await requireUserAuth(req, { intent: "companion:schedule:update", address });
  if (!auth.ok) return auth.response;

  const player = await prisma.adminPlayer.findFirst({ where: { address: auth.address } });
  if (!player) {
    return NextResponse.json({ error: "player_not_found" }, { status: 404 });
  }

  await prisma.adminPlayer.update({
    where: { id: player.id },
    data: {
      schedule: { slots },
      updatedAt: new Date(),
    },
  });

  return NextResponse.json({ ok: true, slots });
}
