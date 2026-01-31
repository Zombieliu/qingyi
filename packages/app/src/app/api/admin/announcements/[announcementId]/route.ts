import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { updateAnnouncement } from "@/lib/admin-store";
import type { AdminAnnouncement, AnnouncementStatus } from "@/lib/admin-types";

type RouteContext = {
  params: Promise<{ announcementId: string }>;
};

export async function PATCH(
  req: Request,
  { params }: RouteContext
) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { announcementId } = await params;
  if (!announcementId) {
    return NextResponse.json({ error: "Missing announcementId" }, { status: 400 });
  }

  let body: Partial<AdminAnnouncement> = {};
  try {
    body = (await req.json()) as Partial<AdminAnnouncement>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Partial<AdminAnnouncement> = {};
  if (typeof body.title === "string") patch.title = body.title;
  if (typeof body.tag === "string") patch.tag = body.tag;
  if (typeof body.content === "string") patch.content = body.content;
  if (typeof body.status === "string") patch.status = body.status as AnnouncementStatus;

  const updated = await updateAnnouncement(announcementId, patch);
  if (!updated) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}
