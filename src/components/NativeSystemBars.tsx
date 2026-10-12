"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { SafeArea, SystemBarsStyle } from "@capacitor-community/safe-area";

/** Whether the page is drawn dark right now: a saved "dark", or "system" on a dark phone. */
function isDark(): boolean {
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme) return theme === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * The phone app draws edge to edge, so the status and navigation bars sit on
 * the page itself. Their icons follow the page's theme rather than the
 * phone's: a phone in dark mode would otherwise put white icons on VolSoc's
 * light linen. Renders nothing; does nothing on the web, or in an app build
 * from before the safe-area plugin.
 */
export function NativeSystemBars() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("SafeArea")) return;
    let last: boolean | null = null;
    const apply = () => {
      const dark = isDark();
      if (dark === last) return;
      last = dark;
      SafeArea.setSystemBarsStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {
        // An older app build: the bars keep the phone's own style.
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", apply);
    };
  }, []);
  return null;
}
