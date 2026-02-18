import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { removeAnnouncement, updateAnnouncement } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import type { AdminAnnouncement, AnnouncementStatus } from "@/lib/admin/admin-types";

type RouteContext = {
  params: Promise<{ announcementId: string }>;
};

export async function PATCH(
  req: Request,
  { params }: RouteContext
) {
  const auth = await requireAdmin(req, { role: "ops" });
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
  await recordAudit(req, auth, "announcements.update", "announcement", announcementId, patch);
  return NextResponse.json(updated);
}

export async function DELETE(
  req: Request,
  { params }: RouteContext
) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const { announcementId } = await params;
  if (!announcementId) {
    return NextResponse.json({ error: "Missing announcementId" }, { status: 400 });
  }
  const removed = await removeAnnouncement(announcementId);
  if (!removed) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await recordAudit(req, auth, "announcements.delete", "announcement", announcementId);
  return NextResponse.json({ ok: true });
}
