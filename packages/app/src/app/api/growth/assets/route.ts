import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { createAsset } from "@/lib/services/growth-os-service";
import { prisma } from "@/lib/db";

/** GET /api/growth/assets?campaignId=xxx */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if ("status" in auth) return auth;

  const campaignId = req.nextUrl.searchParams.get("campaignId");
  const where = campaignId ? { campaignId } : {};

  const assets = await prisma.growthAsset.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(assets);
}

/** POST /api/growth/assets — create asset with tracking link */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, { role: "ops" });
  if ("status" in auth) return auth;

  const body = await req.json();
  if (!body.campaignId || !body.type) {
    return NextResponse.json({ error: "campaignId and type required" }, { status: 400 });
  }

  const asset = await createAsset({
    campaignId: body.campaignId,
    type: body.type,
    title: body.title,
    url: body.url,
    content: body.content,
  });

  return NextResponse.json(asset, { status: 201 });
}
