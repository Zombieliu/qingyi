import { NextResponse } from "next/server";
import { z } from "zod";
import { recordGrowthEvent } from "@/lib/analytics-store";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/shared/api-utils";
import { env } from "@/lib/env";
import { parseBody } from "@/lib/shared/api-validation";

const trackSchema = z.object({
  event: z.string().trim().min(1).max(64),
  clientId: z.string().max(64).optional(),
  sessionId: z.string().max(64).optional(),
  userAddress: z.string().max(128).optional(),
  path: z.string().max(256).optional(),
  referrer: z.string().max(256).optional(),
  ua: z.string().max(256).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.number().optional(),
});

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!(await rateLimit(`track:${ip}`, env.TRACK_RATE_LIMIT_MAX, env.TRACK_RATE_LIMIT_WINDOW_MS))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const parsed = await parseBody(req, trackSchema);
  if (!parsed.success) return parsed.response;
  const payload = parsed.data;

  try {
    await recordGrowthEvent({
      event: payload.event,
      clientId: payload.clientId?.trim() || undefined,
      sessionId: payload.sessionId?.trim() || undefined,
      userAddress: payload.userAddress?.trim() || undefined,
      path: payload.path?.trim() || undefined,
      referrer: payload.referrer?.trim() || undefined,
      ua: payload.ua?.trim() || undefined,
      meta: payload.meta,
      createdAt: payload.createdAt ?? Date.now(),
    });
  } catch (error) {
    console.error("track event failed", error);
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
