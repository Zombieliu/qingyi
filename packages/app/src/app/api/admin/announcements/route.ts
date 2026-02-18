import { NextResponse } from "next/server";
import crypto from "crypto";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { addAnnouncement, listAnnouncements } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import type { AdminAnnouncement, AnnouncementStatus } from "@/lib/admin/admin-types";

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;
  const announcements = await listAnnouncements();
  return NextResponse.json(announcements);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  let body: Partial<AdminAnnouncement> = {};
  try {
    body = (await req.json()) as Partial<AdminAnnouncement>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.title) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }

  const announcement: AdminAnnouncement = {
    id: body.id || `ANN-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    title: body.title,
    tag: body.tag || "公告",
    content: body.content || "",
    status: (body.status as AnnouncementStatus) || "draft",
    createdAt: Date.now(),
  };

  await addAnnouncement(announcement);
  await recordAudit(req, auth, "announcements.create", "announcement", announcement.id, {
    title: announcement.title,
    status: announcement.status,
  });
  return NextResponse.json(announcement, { status: 201 });
}
