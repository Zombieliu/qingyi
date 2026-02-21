import type { MetadataRoute } from "next";
import { listPublicAnnouncements } from "@/lib/admin/admin-store";
import { env } from "@/lib/env";

const siteUrl = env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const revalidate = 300;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const items: MetadataRoute.Sitemap = [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${siteUrl}/faq`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${siteUrl}/updates`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.7,
    },
  ];

  try {
    const announcements = await listPublicAnnouncements();
    announcements.forEach((item) => {
      items.push({
        url: `${siteUrl}/updates/${item.id}`,
        lastModified: new Date(item.updatedAt || item.createdAt),
        changeFrequency: "monthly",
        priority: 0.5,
      });
    });
  } catch {
    // ignore sitemap fetch errors
  }

  return items;
}
