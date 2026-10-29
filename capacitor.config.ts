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
    // Edge to edge: the page runs under the status and navigation bars and
    // pads itself with env(safe-area-inset-*), as on iOS. Capacitor's own
    // margins would fight @capacitor-community/safe-area, which pads the web
    // view only on the older WebViews (Chromium < 140) that report 0 insets.
    adjustMarginsForEdgeToEdge: "disable",
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
    // A collection alert should show even with the app open.
    PushNotifications: { presentationOptions: ["badge", "sound", "alert"] },
  },
};

export default config;
