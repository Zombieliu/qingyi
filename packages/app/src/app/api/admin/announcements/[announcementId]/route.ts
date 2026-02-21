import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { removeAnnouncement, updateAnnouncement } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import type { AnnouncementStatus } from "@/lib/admin/admin-types";
import { parseBody } from "@/lib/shared/api-validation";

const patchSchema = z.object({
  title: z.string().optional(),
  tag: z.string().optional(),
  content: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
});

type RouteContext = {
  params: Promise<{ announcementId: string }>;
};

export async function PATCH(req: Request, { params }: RouteContext) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const { announcementId } = await params;
  if (!announcementId) {
    return NextResponse.json({ error: "Missing announcementId" }, { status: 400 });
  }

  const parsed = await parseBody(req, patchSchema);
  if (!parsed.success) return parsed.response;

  const patch: Record<string, unknown> = {};
  if (parsed.data.title !== undefined) patch.title = parsed.data.title;
  if (parsed.data.tag !== undefined) patch.tag = parsed.data.tag;
  if (parsed.data.content !== undefined) patch.content = parsed.data.content;
  if (parsed.data.status !== undefined) patch.status = parsed.data.status as AnnouncementStatus;

  const updated = await updateAnnouncement(announcementId, patch);
  if (!updated) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  await recordAudit(req, auth, "announcements.update", "announcement", announcementId, patch);
  return NextResponse.json(updated);
}

export async function DELETE(req: Request, { params }: RouteContext) {
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
