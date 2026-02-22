import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { listCampaigns, createCampaign, updateCampaign } from "@/lib/services/growth-os-service";

/** GET /api/growth/campaigns?channelId=xxx&status=active */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if ("status" in auth) return auth;

  const sp = req.nextUrl.searchParams;
  const campaigns = await listCampaigns({
    channelId: sp.get("channelId") || undefined,
    status: sp.get("status") || undefined,
  });

  return NextResponse.json(campaigns);
}

/** POST /api/growth/campaigns — create or update */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, { role: "ops" });
  if ("status" in auth) return auth;

  const body = await req.json();

  if (body.id) {
    const { id, ...data } = body;
    const updated = await updateCampaign(id, data);
    return NextResponse.json(updated);
  }

  if (!body.channelId || !body.name) {
    return NextResponse.json({ error: "channelId and name required" }, { status: 400 });
  }

  const campaign = await createCampaign({
    channelId: body.channelId,
    name: body.name,
    description: body.description,
    budget: body.budget,
    targetKpi: body.targetKpi,
    startsAt: body.startsAt ? new Date(body.startsAt) : undefined,
    endsAt: body.endsAt ? new Date(body.endsAt) : undefined,
    utmCampaign: body.utmCampaign,
    landingPage: body.landingPage,
  });

  return NextResponse.json(campaign, { status: 201 });
}
