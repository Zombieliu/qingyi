import { NextResponse } from "next/server";
import crypto from "crypto";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin/admin-auth";
import { addAnnouncement, listAnnouncements } from "@/lib/admin/admin-store";
import { recordAudit } from "@/lib/admin/admin-audit";
import type { AdminAnnouncement, AnnouncementStatus } from "@/lib/admin/admin-types";
import { parseBody } from "@/lib/shared/api-validation";

const postSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  tag: z.string().default("nav.news"),
  content: z.string().default(""),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

export async function GET(req: Request) {
  const auth = await requireAdmin(req, { role: "viewer" });
  if (!auth.ok) return auth.response;
  const announcements = await listAnnouncements();
  return NextResponse.json(announcements);
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req, { role: "ops" });
  if (!auth.ok) return auth.response;

  const parsed = await parseBody(req, postSchema);
  if (!parsed.success) return parsed.response;
  const body = parsed.data;

  const announcement: AdminAnnouncement = {
    id: body.id || `ANN-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
    title: body.title,
    tag: body.tag,
    content: body.content,
    status: body.status as AnnouncementStatus,
    createdAt: Date.now(),
  };

  await addAnnouncement(announcement);
  await recordAudit(req, auth, "announcements.create", "announcement", announcement.id, {
    title: announcement.title,
    status: announcement.status,
  });
  return NextResponse.json(announcement, { status: 201 });
}
