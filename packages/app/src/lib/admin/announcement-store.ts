import type { AdminAnnouncement } from "./admin-types";
import { prisma } from "./admin-store-utils";
import { getCache, setCache } from "../server-cache";

function mapAnnouncement(row: {
  id: string;
  title: string;
  tag: string;
  content: string;
  status: string;
  createdAt: Date;
  updatedAt: Date | null;
}): AdminAnnouncement {
  return {
    id: row.id,
    title: row.title,
    tag: row.tag,
    content: row.content,
    status: row.status as AdminAnnouncement["status"],
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt ? row.updatedAt.getTime() : undefined,
  };
}

export async function listAnnouncements() {
  const rows = await prisma.adminAnnouncement.findMany({ orderBy: { createdAt: "desc" } });
  return rows.map(mapAnnouncement);
}

export async function addAnnouncement(announcement: AdminAnnouncement) {
  const row = await prisma.adminAnnouncement.create({
    data: {
      id: announcement.id,
      title: announcement.title,
      tag: announcement.tag,
      content: announcement.content,
      status: announcement.status,
      createdAt: new Date(announcement.createdAt),
      updatedAt: announcement.updatedAt ? new Date(announcement.updatedAt) : null,
    },
  });
  return mapAnnouncement(row);
}

export async function updateAnnouncement(
  announcementId: string,
  patch: Partial<AdminAnnouncement>
) {
  try {
    const row = await prisma.adminAnnouncement.update({
      where: { id: announcementId },
      data: {
        title: patch.title,
        tag: patch.tag,
        content: patch.content,
        status: patch.status,
        updatedAt: new Date(),
      },
    });
    return mapAnnouncement(row);
  } catch {
    return null;
  }
}

export async function removeAnnouncement(announcementId: string) {
  try {
    await prisma.adminAnnouncement.delete({ where: { id: announcementId } });
    return true;
  } catch {
    return false;
  }
}

export async function removeAnnouncements(announcementIds: string[]) {
  const ids = announcementIds.filter(Boolean);
  if (ids.length === 0) return 0;
  const result = await prisma.adminAnnouncement.deleteMany({ where: { id: { in: ids } } });
  return result.count;
}

export async function listPublicAnnouncements() {
  if (process.env.NEXT_PUBLIC_VISUAL_TEST === "1" || process.env.VISUAL_TEST === "1") {
    return [];
  }
  const cacheKey = "public:announcements";
  const cached = getCache<AdminAnnouncement[]>(cacheKey);
  if (cached) {
    return cached.value;
  }
  const rows = await prisma.adminAnnouncement.findMany({
    where: { status: "published" },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
  });
  const items = rows.map(mapAnnouncement);
  setCache(cacheKey, items, 10_000);
  return items;
}
