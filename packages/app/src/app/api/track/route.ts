import { NextResponse } from "next/server";
import { recordGrowthEvent } from "@/lib/analytics-store";
import { rateLimit } from "@/lib/rate-limit";

const TRACK_RATE_LIMIT_WINDOW_MS = Number(process.env.TRACK_RATE_LIMIT_WINDOW_MS || "60000");
const TRACK_RATE_LIMIT_MAX = Number(process.env.TRACK_RATE_LIMIT_MAX || "120");

function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

function clamp(input: unknown, max = 256) {
  if (typeof input !== "string") return undefined;
  const trimmed = input.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  if (!(await rateLimit(`track:${ip}`, TRACK_RATE_LIMIT_MAX, TRACK_RATE_LIMIT_WINDOW_MS))) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const event = clamp(payload.event, 64);
  if (!event) {
    return NextResponse.json({ error: "event_required" }, { status: 400 });
  }

  const meta = payload.meta && typeof payload.meta === "object" ? payload.meta : undefined;

  try {
    await recordGrowthEvent({
      event,
      clientId: clamp(payload.clientId, 64),
      sessionId: clamp(payload.sessionId, 64),
      userAddress: clamp(payload.userAddress, 128),
      path: clamp(payload.path, 256),
      referrer: clamp(payload.referrer, 256),
      ua: clamp(payload.ua, 256),
      meta: meta as Record<string, unknown> | undefined,
      createdAt: typeof payload.createdAt === "number" ? payload.createdAt : Date.now(),
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
