import { NextRequest, NextResponse } from "next/server";
import {
  findOrCreateContact,
  recordTouchpoint,
  getAssetByShortCode,
  incrementAssetClick,
} from "@/lib/services/growth-os-service";
import { trackEventSchema } from "@/lib/services/growth-validation";

// Simple in-memory rate limiter for public track endpoint
const trackLimiter = new Map<string, { count: number; resetAt: number }>();
const TRACK_RATE_LIMIT = 30; // 30 requests per minute per IP
const TRACK_WINDOW_MS = 60_000;

function checkTrackRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = trackLimiter.get(ip);
  if (!entry || now > entry.resetAt) {
    trackLimiter.set(ip, { count: 1, resetAt: now + TRACK_WINDOW_MS });
    return true;
  }
  if (entry.count >= TRACK_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

// Cleanup stale entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of trackLimiter) {
      if (now > val.resetAt) trackLimiter.delete(key);
    }
  }, 300_000);
}

/**
 * GET /api/growth/track?utm_source=douyin&utm_medium=video&utm_campaign=xxx&ref=shortcode
 * Public endpoint — records a touchpoint and redirects to landing page.
 */
export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkTrackRateLimit(ip)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const sp = req.nextUrl.searchParams;
  const utmSource = sp.get("utm_source") || sp.get("source") || "direct";
  const utmMedium = sp.get("utm_medium") || undefined;
  const utmCampaign = sp.get("utm_campaign") || undefined;
  const utmContent = sp.get("utm_content") || undefined;
  const utmTerm = sp.get("utm_term") || undefined;
  const shortCode = sp.get("ref") || undefined;
  const userAddress = sp.get("ua") || undefined;
  const redirect = sp.get("redirect") || "/home";

  const ua = req.headers.get("user-agent") || "";
  const deviceType = /mobile|android|iphone/i.test(ua) ? "mobile" : "desktop";

  try {
    let campaignId: string | undefined;
    if (shortCode) {
      const asset = await getAssetByShortCode(shortCode);
      if (asset) {
        campaignId = asset.campaignId;
        await incrementAssetClick(asset.id);
      }
    }

    const contact = await findOrCreateContact({
      userAddress: userAddress || undefined,
      source: utmSource,
      ip,
      userAgent: ua,
    });

    await recordTouchpoint({
      contactId: contact.id,
      channelCode: utmSource,
      campaignId,
      utmSource,
      utmMedium,
      utmCampaign,
      utmContent,
      utmTerm,
      touchType: "visit",
      landingPage: redirect,
      referrer: req.headers.get("referer") || undefined,
      ip,
      userAgent: ua,
      deviceType,
    });
  } catch (err) {
    console.error("[Growth Track]", err);
  }

  const url = new URL(redirect, req.nextUrl.origin);
  if (utmSource !== "direct") url.searchParams.set("utm_source", utmSource);
  if (utmMedium) url.searchParams.set("utm_medium", utmMedium);
  if (utmCampaign) url.searchParams.set("utm_campaign", utmCampaign);

  return NextResponse.redirect(url, 302);
}

/**
 * POST /api/growth/track — programmatic touchpoint recording
 */
export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkTrackRateLimit(ip)) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const parsed = trackEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { contactId, userAddress, channelCode, touchType, orderId, orderAmount, campaignId } =
      parsed.data;

    let resolvedContactId = contactId;
    if (!resolvedContactId && userAddress) {
      const contact = await findOrCreateContact({ userAddress, source: channelCode });
      resolvedContactId = contact.id;
    }

    if (!resolvedContactId) {
      return NextResponse.json({ error: "contactId or userAddress required" }, { status: 400 });
    }

    const tp = await recordTouchpoint({
      contactId: resolvedContactId,
      channelCode: channelCode || "direct",
      campaignId,
      touchType: touchType || "visit",
      orderId,
      orderAmount,
      ip,
      userAgent: req.headers.get("user-agent") || undefined,
    });

    return NextResponse.json({ ok: true, touchpointId: tp.id });
  } catch (err) {
    console.error("[Growth Track POST]", err);
    return NextResponse.json({ error: "Track failed" }, { status: 500 });
  }
}
