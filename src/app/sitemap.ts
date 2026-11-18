import type { MetadataRoute } from "next";
import { listDirectory } from "@/lib/directoryStore";
import { SITE_URL } from "@/lib/seo";

// New places to volunteer show up within the hour.
export const revalidate = 3600;

/**
 * The public pages plus one page per active place to volunteer. Sign-in, the
 * committee portal, /staff, the Zero Food Waste form (noindex by
 * choice) and the iCal feeds are left out. lastModified only
 * where there is a real date: a place's last edit, the privacy page's own date.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/calendar`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/opportunities`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${SITE_URL}/timetable`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/volunteer`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/privacy`, lastModified: "2026-11-07", changeFrequency: "yearly", priority: 0.3 },
  ];
  try {
    const entries = await listDirectory({ activeOnly: true });
    for (const entry of entries) {
      pages.push({ url: `${SITE_URL}/opportunities/${entry.slug}`, lastModified: entry.updatedAt, changeFrequency: "monthly", priority: 0.6 });
    }
  } catch (error) {
    console.error("[sitemap] directory", error);
  }
  return pages;
}
