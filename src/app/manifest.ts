import type { MetadataRoute } from "next";

// Describes the site for browsers and search; display "browser" so the
// website doesn't start offering itself as an install next to the store apps.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "UCL Volunteering Society",
    short_name: "VolSoc",
    description: "Volunteering across UCL and London in one place: what's on, places to volunteer and the VolSoc volunteer list.",
    start_url: "/",
    display: "browser",
    background_color: "#feefe5",
    theme_color: "#feefe5",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
