import type { CapacitorConfig } from "@capacitor/cli";

// The app is a native shell around the live site, as ucl-hiking's is: website
// deploys reach phones without a store release. Point it at a local server
// with CAPACITOR_APP_URL=http://<lan-ip>:3000 when working on the app itself.
const appUrl = process.env.CAPACITOR_APP_URL || "https://uclvolunteering.org";

const config: CapacitorConfig = {
  appId: "org.uclvolunteering.app",
  appName: "VolSoc",
  // Only shown when the first launch has no connection.
  webDir: "capacitor-dist",
  // Lets the site tell the app apart from a phone browser.
  appendUserAgent: "VolSocApp",
  backgroundColor: "#feefe5",
  android: {
    // Pad the web view clear of the status and navigation bars when Android
    // draws edge to edge, so the site needs no Android-only insets.
    adjustMarginsForEdgeToEdge: "auto",
  },
  ios: {
    // The site pads itself with env(safe-area-inset-*) (viewportFit: cover).
    contentInset: "never",
  },
  server: {
    // Opens on the calendar: the flag on the front page is the website's door,
    // the app's is what's on.
    url: `${appUrl.replace(/\/+$/, "")}/calendar`,
    cleartext: appUrl.startsWith("http://"),
  },
  plugins: {
    Browser: { presentationStyle: "popover" },
  },
};

export default config;
