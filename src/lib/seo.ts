import type { Metadata } from "next";

/**
 * Search and AI-citation plumbing: the one canonical origin, per-page metadata
 * and the JSON-LD graph. Every indexable page points its canonical here, and
 * robots.ts tells crawlers on any other host (ucl-volunteering.vercel.app,
 * www., previews) to stay out.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://uclvolunteering.org").replace(/\/+$/, "");
export const SITE_HOST = new URL(SITE_URL).host;
export const SITE_NAME = "UCL Volunteering Society";

/** Vercel preview builds are never indexed. Production serves several hosts; robots.ts sorts those out. */
export const IS_PREVIEW = process.env.VERCEL_ENV === "preview";

export const SITE_DESCRIPTION =
  "UCL Volunteering Society (VolSoc) puts volunteering across UCL and London in one place: what's on, places to volunteer and a volunteer list for UCL students.";

// The share card from app/opengraph-image.tsx. A page that sets its own
// openGraph replaces the inherited one, so each names the card again.
const shareImage = { url: "/opengraph-image", width: 1200, height: 630, alt: "The VolSoc flag: a handshake in a heart" };

/** Title, description, canonical, Open Graph and Twitter card for one indexable page. */
export function pageMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { title, description, url: path, siteName: SITE_NAME, locale: "en_GB", type: "website", images: [shareImage] },
    twitter: { card: "summary_large_image", title, description, images: [shareImage] },
  };
}

/** Kept out of search: sign-in, the committee portal, staff tools. */
export const noIndex: Metadata = { robots: { index: false, follow: false } };

export const ids = {
  website: `${SITE_URL}/#website`,
  society: `${SITE_URL}/#society`,
  webApp: `${SITE_URL}/#webapp`,
  mobileApp: `${SITE_URL}/#app`,
  adam: "https://maybeitssoftware.co.uk/#adam",
  maybeItsSoftware: "https://maybeitssoftware.co.uk/#org",
};

const APP_DESCRIPTION =
  "Volunteering events from VolSoc, UCL Student Social Impact and UCL's social impact societies in one calendar, the VolSoc volunteer list with UCL sign-in, and the Zero Food Waste shift log.";

/** The front page's graph: the site, the society, and the website/app. */
export function homeGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": ids.website,
        url: `${SITE_URL}/`,
        name: SITE_NAME,
        alternateName: "VolSoc",
        description: SITE_DESCRIPTION,
        inLanguage: "en-GB",
        publisher: { "@id": ids.society },
      },
      {
        "@type": "Organization",
        "@id": ids.society,
        name: SITE_NAME,
        alternateName: "VolSoc",
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/apple-icon.png`,
        image: `${SITE_URL}/volsoc-flag.png`,
        description: "A student society at University College London that brings students together to volunteer across UCL and London.",
        areaServed: "London",
        parentOrganization: { "@type": "Organization", name: "Students' Union UCL", url: "https://studentsunionucl.org" },
        sameAs: ["https://instagram.com/ucl.volsoc/", "https://joinsoc.uk/ucl/volunteering-society"],
      },
      {
        "@type": "WebApplication",
        "@id": ids.webApp,
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        description: APP_DESCRIPTION,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Any (web browser)",
        inLanguage: "en-GB",
        isAccessibleForFree: true,
        provider: { "@id": ids.society },
        creator: { "@id": ids.adam },
        publisher: { "@id": ids.maybeItsSoftware },
      },
      {
        "@type": "MobileApplication",
        "@id": ids.mobileApp,
        name: "UCL Volunteering",
        alternateName: "VolSoc",
        description: APP_DESCRIPTION,
        applicationCategory: "LifestyleApplication",
        operatingSystem: "iOS, Android",
        downloadUrl: "https://apps.apple.com/gb/app/ucl-volunteering/id6822039233",
        installUrl: "https://play.google.com/store/apps/details?id=org.uclvolunteering.app",
        sameAs: ["https://apps.apple.com/gb/app/ucl-volunteering/id6822039233", "https://play.google.com/store/apps/details?id=org.uclvolunteering.app"],
        offers: { "@type": "Offer", price: "0", priceCurrency: "GBP" },
        inLanguage: "en-GB",
        provider: { "@id": ids.society },
        creator: { "@id": ids.adam },
        publisher: { "@id": ids.maybeItsSoftware },
      },
      { "@type": "Person", "@id": ids.adam, name: "Adam Cleary", sameAs: ["https://github.com/MaybeItsAdam"] },
      {
        "@type": "Organization",
        "@id": ids.maybeItsSoftware,
        name: "MaybeItsSoftware",
        url: "https://maybeitssoftware.co.uk",
        sameAs: ["https://github.com/MaybeItsSoftware"],
      },
    ],
  };
}

/** Home > … > page, for the public sub-pages. */
export function breadcrumbs(trail: { name: string; path: string }[]) {
  const items = [{ name: SITE_NAME, path: "/" }, ...trail];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path === "/" ? "/" : item.path}`,
    })),
  };
}
