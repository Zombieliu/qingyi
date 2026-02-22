import { NextRequest, NextResponse } from "next/server";
import {
  findOrCreateContact,
  recordTouchpoint,
  getAssetByShortCode,
  incrementAssetClick,
} from "@/lib/services/growth-os-service";

/**
 * GET /api/growth/track?utm_source=douyin&utm_medium=video&utm_campaign=xxx&ref=shortcode
 * Public endpoint — records a touchpoint and redirects to landing page.
 * Also used by short links: /api/growth/track?ref=abc12345
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const utmSource = sp.get("utm_source") || sp.get("source") || "direct";
  const utmMedium = sp.get("utm_medium") || undefined;
  const utmCampaign = sp.get("utm_campaign") || undefined;
  const utmContent = sp.get("utm_content") || undefined;
  const utmTerm = sp.get("utm_term") || undefined;
  const shortCode = sp.get("ref") || undefined;
  const userAddress = sp.get("ua") || undefined;
  const redirect = sp.get("redirect") || "/home";

  // Detect device
  const ua = req.headers.get("user-agent") || "";
  const deviceType = /mobile|android|iphone/i.test(ua) ? "mobile" : "desktop";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined;

  try {
    // Resolve short code to campaign
    let campaignId: string | undefined;
    if (shortCode) {
      const asset = await getAssetByShortCode(shortCode);
      if (asset) {
        campaignId = asset.campaignId;
        await incrementAssetClick(asset.id);
      }
    }

    // Find or create contact
    const contact = await findOrCreateContact({
      userAddress: userAddress || undefined,
      source: utmSource,
      ip,
      userAgent: ua,
    });

    // Record touchpoint
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
    // Don't block redirect on tracking errors
  }

  // Redirect to landing page with UTM params preserved
  const url = new URL(redirect, req.nextUrl.origin);
  if (utmSource) url.searchParams.set("utm_source", utmSource);
  if (utmMedium) url.searchParams.set("utm_medium", utmMedium);
  if (utmCampaign) url.searchParams.set("utm_campaign", utmCampaign);

  return NextResponse.redirect(url, 302);
}

/**
 * POST /api/growth/track — programmatic touchpoint recording
 * Used by frontend to record events (register, order, etc.)
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { contactId, userAddress, channelCode, touchType, orderId, orderAmount, campaignId } =
      body;

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
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
      userAgent: req.headers.get("user-agent") || undefined,
    });

    return NextResponse.json({ ok: true, touchpointId: tp.id });
  } catch (err) {
    console.error("[Growth Track POST]", err);
    return NextResponse.json({ error: "Track failed" }, { status: 500 });
  }
}
